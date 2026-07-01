import { describe, it, expect, vi, beforeEach } from "vitest";

const sendMessage = vi.fn();
// sendMessage now returns a SendResult ({ ok }) — the route checks it.
vi.mock("@/lib/telegram", () => ({
  sendMessage: (...a: unknown[]) => {
    sendMessage(...a);
    return Promise.resolve({ ok: true, status: 200, blocked: false });
  },
}));

// minimal chainable supabase stub
const state = {
  zones: [] as any[],
  forecast: [] as any[],
  subs: [] as any[],
  alerted: new Map<string, string>(), // `${zone}:${chat}` -> alerted_class
  briefings: new Set<string>(), // `${chat}:${date}`
};
function makeDb() {
  return {
    from(table: string) {
      return buildQuery(table);
    },
  };
}
function buildQuery(table: string): any {
  const q: any = {
    _table: table,
    _filters: {} as Record<string, unknown>,
    _inFilters: {} as Record<string, unknown[]>,
    select() { return q; },
    eq(col: string, val: unknown) { q._filters[col] = val; return q; },
    in(col: string, vals: unknown[]) { q._inFilters[col] = vals; return q; },
    order() { return q; },
    limit() { return q; },
    range() { return q; }, // paginated reads (fetchAllRows) — no-op in the stub
    gte() { return q; },
    async single() {
      if (table === "fire_danger") return { data: { computed_at: "2026-06-23" } };
      if (table === "prevention_alerted") {
        const key = `${q._filters.zone_id}:${q._filters.chat_id}`;
        const cls = state.alerted.get(key);
        return { data: cls ? { alerted_class: cls } : null };
      }
      return { data: null };
    },
    async maybeSingle() { return q.single(); },
    insert(row: any) {
      if (table === "prevention_briefing_sent") {
        const key = `${row.chat_id}:${row.sent_date}`;
        if (state.briefings.has(key)) {
          return { select: () => ({ single: async () => ({ data: null, error: { code: "23505" } }) }) };
        }
        state.briefings.add(key);
        return { select: () => ({ single: async () => ({ data: { chat_id: row.chat_id }, error: null }) }) };
      }
      return { select: () => ({ single: async () => ({ data: {}, error: null }) }) };
    },
    upsert(row: any) { state.alerted.set(`${row.zone_id}:${row.chat_id}`, row.alerted_class); return Promise.resolve({ error: null }); },
    delete() { return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }; },
    then(resolve: (v: any) => void) {
      if (table === "danger_zones") return resolve({ data: state.zones });
      if (table === "fire_danger") return resolve({ data: state.forecast });
      if (table === "subscribers") {
        // honour the prevention_mode .in() filter so "off" subs are excluded
        const allowed = q._inFilters["prevention_mode"] as string[] | undefined;
        const filtered = allowed
          ? state.subs.filter((s: any) => allowed.includes(s.prevention_mode))
          : state.subs;
        return resolve({ data: filtered });
      }
      return resolve({ data: [] });
    },
  };
  return q;
}
vi.mock("@/lib/supabase", () => ({ getSupabase: () => makeDb() }));
vi.mock("@/lib/cron-auth", () => ({ isCronAuthorized: () => true }));

import { GET } from "@/app/api/prevention-alerts/route";

function req() { return new Request("https://x/api/prevention-alerts?secret=ok"); }

beforeEach(() => {
  sendMessage.mockClear();
  state.zones = [{ id: "tdf-norte-estepa", name: "Estepa Norte", bbox: [-54, -53, -68.5, -67], province: "tierra-del-fuego" }];
  state.alerted.clear();
  state.briefings.clear();
});

describe("GET /api/prevention-alerts", () => {
  it("sends an alert when a covered sub's zone crosses to alto", async () => {
    state.subs = [{ chat_id: 1, lat: -53.5, lng: -67.7, prevention_mode: "alerts" }];
    state.forecast = [{ zone_id: "tdf-norte-estepa", target_date: futureDay(0), danger_class: "alto" }];
    const res = await GET(req());
    const body = await res.json();
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(body.alerts).toBe(1);
  });

  it("never messages a sub in off mode", async () => {
    state.subs = [{ chat_id: 2, lat: -53.5, lng: -67.7, prevention_mode: "off" }];
    state.forecast = [{ zone_id: "tdf-norte-estepa", target_date: futureDay(0), danger_class: "extremo" }];
    await GET(req());
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

function futureDay(offset: number): string {
  const d = new Date(Date.now() - 3 * 3600_000 + offset * 86400_000);
  return d.toISOString().slice(0, 10);
}
