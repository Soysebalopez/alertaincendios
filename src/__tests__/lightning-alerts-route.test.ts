import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * WHI-907 part 2 — dry-lightning alerts from REAL flashes (GOES-19 GLM).
 *
 * The GLM sync leaves a heartbeat (`_clara_config.glm_last_sync_at`) on every
 * successful run, flashes or not. Only while that heartbeat is recent — and the
 * flashes table exists — can "no flash near you" be trusted. Otherwise the
 * route falls back to the thunderstorm-forecast method it used before.
 */
const sendMessage = vi.fn();
const fetchLightningRisk = vi.fn();
const fetchDryConditions = vi.fn();
const SUB = { chat_id: 1, lat: -38.72, lng: -62.27, city_name: "Bahía Blanca", lightning_enabled: true };

type QueryResult = { data: unknown; error: { code: string; message: string } | null };
const state: {
  flashes: QueryResult;
  heartbeat: string | null;
  config: Record<string, string>;
  inserts: Array<{ table: string; row: unknown }>;
  upserts: Array<{ table: string; row: unknown }>;
} = { flashes: { data: [], error: null }, heartbeat: null, config: {}, inserts: [], upserts: [] };

vi.mock("@/lib/telegram", () => ({
  sendMessage: (...args: unknown[]) => sendMessage(...args),
  escapeHtml: (s: string) => s,
}));
vi.mock("@/lib/lightning", () => ({
  fetchLightningRisk: (...args: unknown[]) => fetchLightningRisk(...args),
  fetchDryConditions: (...args: unknown[]) => fetchDryConditions(...args),
}));
vi.mock("@/lib/paginate", () => ({ fetchAllRows: async () => [SUB] }));

function query(table: string) {
  const q: Record<string, unknown> = {};
  let configKey: string | null = null;
  for (const method of ["select", "gte", "lte", "order", "limit"]) q[method] = () => q;
  q.eq = (column: string, value: unknown) => {
    if (column === "key") configKey = String(value);
    return q;
  };
  q.maybeSingle = async () => {
    if (table !== "_clara_config") return { data: null, error: null };
    const value = configKey === "glm_last_sync_at" ? state.heartbeat : state.config[configKey ?? ""];
    return { data: value ? { value } : null, error: null };
  };
  q.insert = async (row: unknown) => {
    state.inserts.push({ table, row });
    return { error: null };
  };
  q.upsert = async (row: unknown) => {
    state.upserts.push({ table, row });
    return { error: null };
  };
  q.then = (resolve: (value: QueryResult) => void) =>
    resolve(table === "lightning_flashes" ? state.flashes : { data: [], error: null });
  return q;
}
vi.mock("@/lib/supabase", () => ({ getSupabase: () => ({ from: (table: string) => query(table) }) }));

import { GET } from "@/app/api/lightning-alerts/route";

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const request = () => new Request("https://x/api/lightning-alerts?secret=test-secret");
const nearFlash = () => ({ flash_at: minutesAgo(4), lat: SUB.lat + 0.09, lng: SUB.lng }); // ~10 km

beforeEach(() => {
  process.env.CRON_SECRET = "test-secret";
  sendMessage.mockReset().mockResolvedValue({ ok: true, status: 200, blocked: false });
  fetchLightningRisk.mockReset();
  fetchDryConditions.mockReset();
  state.flashes = { data: [], error: null };
  state.heartbeat = minutesAgo(3);
  state.config = {};
  state.inserts = [];
  state.upserts = [];
  delete process.env.XWEATHER_API_KEY;
  delete process.env.XWEATHER_CLIENT_ID;
  delete process.env.XWEATHER_CLIENT_SECRET;
  vi.unstubAllGlobals();
});

describe("GET /api/lightning-alerts — real GLM flashes", () => {
  it("alerts a dry thunderstorm when a real flash is near the subscriber", async () => {
    state.flashes = { data: [nearFlash()], error: null };
    fetchDryConditions.mockResolvedValue({ humidity: 35, recentRainMm: 0 });

    const body = await (await GET(request())).json();

    expect(body.source).toBe("glm");
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(String(sendMessage.mock.calls[0][1])).toMatch(/Rayo detectado a ~10 km/);
    expect(fetchLightningRisk).not.toHaveBeenCalled();
    expect(state.inserts.map((insert) => insert.table)).toEqual(["lightning_alerted"]);
  });

  it("does not alert when the only flashes are far away", async () => {
    state.flashes = { data: [{ flash_at: minutesAgo(4), lat: SUB.lat + 2, lng: SUB.lng }], error: null };

    await GET(request());

    expect(sendMessage).not.toHaveBeenCalled();
    expect(fetchDryConditions).not.toHaveBeenCalled();
  });

  it("does not alert when the air is humid", async () => {
    state.flashes = { data: [nearFlash()], error: null };
    fetchDryConditions.mockResolvedValue({ humidity: 80, recentRainMm: 0 });

    await GET(request());

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it.each([
    ["the lightning table does not exist yet", () => {
      state.flashes = { data: null, error: { code: "PGRST205", message: "table not found" } };
    }],
    ["the GLM sync is stale", () => {
      state.heartbeat = minutesAgo(45);
    }],
    ["the GLM sync never ran", () => {
      state.heartbeat = null;
    }],
  ])("falls back to the thunderstorm forecast when %s", async (_label, arrange) => {
    arrange();
    fetchLightningRisk.mockResolvedValue({
      hasThunderstorm: true,
      hasFireRisk: true,
      humidity: 30,
      recentRainMm: 0,
      description: "",
      source: "open-meteo",
    });

    const body = await (await GET(request())).json();

    expect(body.source).toBe("weather-code");
    expect(fetchLightningRisk).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
});

/**
 * WHI-929 — Xweather (Vaisala) left the free service on 2026-10-02: its free
 * plan forbids commercial use and showing its data to third parties, and has no
 * spending cap. Even with credentials still loaded in the environment, the
 * route must never call it nor credit it. Broken on purpose before trusting it:
 * with the old route this test fails on both assertions.
 */
describe("GET /api/lightning-alerts — Xweather is not in the free service", () => {
  const network = vi.fn();

  beforeEach(() => {
    state.flashes = { data: [nearFlash()], error: null };
    fetchDryConditions.mockResolvedValue({ humidity: 35, recentRainMm: 0 });
    network.mockReset().mockImplementation(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", network);
  });

  it("never asks Xweather nor credits it, even with credentials loaded", async () => {
    process.env.XWEATHER_API_KEY = "someid_somesecret";

    await GET(request());

    expect(network).not.toHaveBeenCalled();
    const msg = String(sendMessage.mock.calls[0][1]);
    expect(msg).not.toMatch(/xweather|vaisala|nube-tierra/i);
    expect(msg).toContain("NOAA GOES-19 (GLM)");
  });
});
