/**
 * Rate limiter dual: Upstash Redis (si las env vars están) o in-memory (fallback).
 *
 * Diseñado para protección de endpoints públicos contra abuso. NO es una
 * defensa fuerte por sí solo — los IPs detrás de NAT o CGNAT comparten clave,
 * y atacantes con rotación de IP la saltean. Cubre el caso común: una sola IP
 * con loop curl pidiendo /api/summary 1000 veces para agotar el budget Groq.
 *
 * Upstash REST API es el path preferido en prod (estado compartido entre todas
 * las instancias serverless). El in-memory es last-resort y per-instance —
 * fría una función nueva y la víctima tiene N tokens más. Aceptable como
 * defense-in-depth, no como defensa única.
 */

const inMemory = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitResult {
  /** True si el request puede proceder. */
  ok: boolean;
  /** Cuántas requests quedan en la ventana actual. */
  remaining: number;
  /** Epoch ms en que se resetea el contador. */
  resetAt: number;
  /** Backend que terminó atendiendo. Útil para logs. */
  backend: "upstash" | "memory" | "disabled";
}

export interface RateLimitOptions {
  /** Identificador del bucket (IP, chat_id, etc). */
  key: string;
  /** Cuántas requests por ventana. */
  limit: number;
  /** Tamaño de la ventana en segundos. */
  windowSec: number;
  /**
   * Prefijo del namespace para separar endpoints (ej. "summary", "wind").
   * Sin esto, dos endpoints compartirían contador para el mismo IP.
   */
  namespace: string;
}

/**
 * Resuelve un rate limit. Devuelve siempre — nunca tira. Si todo falla, deja
 * pasar (fail-open) y loguea — preferimos UX caída a UX rota.
 */
export async function checkRateLimit(opts: RateLimitOptions): Promise<RateLimitResult> {
  const upstash = upstashEnv();
  if (upstash) {
    try {
      return await upstashCheck(opts, upstash);
    } catch (err) {
      console.warn("[ratelimit] upstash failed, falling back to memory", {
        namespace: opts.namespace,
        err: err instanceof Error ? err.message : String(err),
      });
      return memoryCheck(opts);
    }
  }
  return memoryCheck(opts);
}

/* ─── Upstash REST API (sin SDK) ─── */

function upstashEnv(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  return { url, token };
}

async function upstashCheck(
  opts: RateLimitOptions,
  env: { url: string; token: string }
): Promise<RateLimitResult> {
  const k = `rl:${opts.namespace}:${opts.key}`;
  // INCR + EXPIRE en pipeline atómico. Pipeline ejecuta secuencialmente en el
  // servidor — el EXPIRE solo se setea si la INCR creó la key.
  const res = await fetch(`${env.url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      ["INCR", k],
      ["EXPIRE", k, String(opts.windowSec), "NX"],
      ["PTTL", k],
    ]),
    // Evita timeouts largos — si Upstash anda lento, mejor fallar al fallback
    // que bloquear el request.
    signal: AbortSignal.timeout(800),
  });

  if (!res.ok) {
    throw new Error(`upstash ${res.status}`);
  }

  const data = (await res.json()) as Array<{ result?: number; error?: string }>;
  const count = data[0]?.result ?? 0;
  const pttl = data[2]?.result ?? opts.windowSec * 1000;

  const remaining = Math.max(0, opts.limit - count);
  const resetAt = Date.now() + Math.max(0, pttl);
  return {
    ok: count <= opts.limit,
    remaining,
    resetAt,
    backend: "upstash",
  };
}

/* ─── In-memory fallback ─── */

function memoryCheck(opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const k = `${opts.namespace}:${opts.key}`;
  const existing = inMemory.get(k);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + opts.windowSec * 1000;
    inMemory.set(k, { count: 1, resetAt });
    // Garbage collect: limita el tamaño del map para que no crezca en una
    // instancia warm que sirve por días.
    if (inMemory.size > 10_000) {
      for (const [key, v] of inMemory) {
        if (v.resetAt <= now) inMemory.delete(key);
      }
    }
    return {
      ok: true,
      remaining: opts.limit - 1,
      resetAt,
      backend: "memory",
    };
  }

  existing.count++;
  inMemory.set(k, existing);
  return {
    ok: existing.count <= opts.limit,
    remaining: Math.max(0, opts.limit - existing.count),
    resetAt: existing.resetAt,
    backend: "memory",
  };
}

/* ─── Helpers de HTTP ─── */

/**
 * Extrae el IP del cliente. En Vercel viene en `x-forwarded-for`; el primero
 * de la lista es el real. Si está vacío o es "::1"/"127.0.0.1" devuelve
 * "anon" para no agrupar todo el local-dev en un solo bucket.
 */
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip");
  if (real) return real;
  return "anon";
}

/**
 * Detecta si una request es una llamada server-to-server entre rutas del
 * mismo deployment (ej. /api/summary fetcha /api/wind). En ese caso queremos
 * bypassear el rate limit para no contar contra el usuario su propia chain.
 *
 * Vía: el caller (/api/summary) agrega el header `x-clara-internal` con el
 * valor de CRON_SECRET. Solo el server lo conoce — un atacante externo no
 * puede setearlo. Si la env no está seteada el bypass se desactiva (devuelve
 * false), que es el comportamiento seguro.
 */
export function isInternalCall(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const got = request.headers.get("x-clara-internal");
  return got === expected;
}

/** Headers RFC-6585 + cómodo `Retry-After`. */
export function rateLimitHeaders(result: RateLimitResult, limit: number): HeadersInit {
  const resetSec = Math.max(0, Math.ceil((result.resetAt - Date.now()) / 1000));
  return {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
    ...(result.ok ? {} : { "Retry-After": String(resetSec) }),
  };
}
