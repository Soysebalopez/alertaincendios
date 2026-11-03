import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { markBlockedIfNeeded } from "@/lib/subscriber-blocks";

/**
 * Cuando Telegram devuelve 403 ("bot was blocked by the user"), el suscriptor se
 * marca blocked_at = now() (los crons lo saltean después) y la función devuelve
 * true para que el caller lo loguee como warn, no como error (no va a Sentry).
 * Para cualquier otro fallo NO toca la base y devuelve false (error real).
 */
function fakeDb() {
  const calls: Array<{ op: string; table?: string; row?: unknown; col?: string }> = [];
  const q: Record<string, unknown> = {};
  q.update = (row: unknown) => {
    calls.push({ op: "update", row });
    return q;
  };
  q.eq = (col: string) => {
    calls.push({ op: "eq", col });
    return q;
  };
  q.is = (col: string) => {
    calls.push({ op: "is", col });
    return q;
  };
  // thenable: se resuelve como una query de PostgREST sin error
  q.then = (resolve: (v: { error: null }) => void) => resolve({ error: null });
  const db = { from: (table: string) => { calls.push({ op: "from", table }); return q; } };
  return { db: db as unknown as SupabaseClient, calls };
}

describe("markBlockedIfNeeded", () => {
  it("marca blocked_at y devuelve true cuando el usuario bloqueó el bot (403)", async () => {
    const { db, calls } = fakeDb();
    const result = await markBlockedIfNeeded(db, 123, { blocked: true });
    expect(result).toBe(true);
    const update = calls.find((c) => c.op === "update");
    expect(update?.row).toHaveProperty("blocked_at");
    expect(calls.some((c) => c.op === "from" && c.table === "subscribers")).toBe(true);
    // Sólo marca si no estaba ya marcado (no pisa la fecha original).
    expect(calls.some((c) => c.op === "is" && c.col === "blocked_at")).toBe(true);
    expect(calls.some((c) => c.op === "eq" && c.col === "chat_id")).toBe(true);
  });

  it("no toca la base y devuelve false para otros fallos (no bloqueado)", async () => {
    const { db, calls } = fakeDb();
    const result = await markBlockedIfNeeded(db, 123, { blocked: false });
    expect(result).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
