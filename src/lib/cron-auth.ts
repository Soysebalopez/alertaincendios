import { timingSafeEqual } from "node:crypto";

/**
 * Verificación de autorización para endpoints de cron.
 *
 * Acepta el secret por dos vías:
 *  - query string `?secret=...` (forma legacy, usada por pg_cron + pg_net)
 *  - header `Authorization: Bearer ...` (forma estándar)
 *
 * Usa `timingSafeEqual` para evitar timing attacks. El `===` directo
 * permite a un atacante, con suficientes muestras, inferir el secret
 * carácter por carácter midiendo latencia diferencial — V8 hace short-circuit
 * en el primer byte distinto. La diferencia real es sub-millisegundo y queda
 * mayormente amortizada por la CDN de Vercel, pero es trivial cerrarlo.
 *
 * Si `CRON_SECRET` no está seteado el helper devuelve `false`, lo que asegura
 * que un mal deploy no abre los endpoints (fail-closed).
 */
export function isCronAuthorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  const expectedBuf = Buffer.from(expected, "utf8");

  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("secret");
  const fromHeader = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  // Cualquiera de los dos canales habilita el request.
  return (
    safeEquals(fromQuery, expectedBuf) ||
    safeEquals(fromHeader, expectedBuf)
  );
}

function safeEquals(candidate: string | null | undefined, expected: Buffer): boolean {
  if (!candidate) return false;
  const candidateBuf = Buffer.from(candidate, "utf8");
  // timingSafeEqual exige misma length — si difieren devolvemos false sin
  // exponer el largo del secret por short-circuit.
  if (candidateBuf.length !== expected.length) return false;
  return timingSafeEqual(candidateBuf, expected);
}
