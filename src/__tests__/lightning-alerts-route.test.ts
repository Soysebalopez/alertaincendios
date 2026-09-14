import { readFileSync } from "node:fs";
import path from "node:path";
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
 * WHI-907 part 3 — when an alert is already going out from real GLM flashes,
 * Xweather (Vaisala) can say whether lightning actually hit the ground near
 * the subscriber in the last 5 minutes. Optional: without credentials, over
 * the month's budget, or on any failure, the alert goes out exactly as before.
 */
describe("GET /api/lightning-alerts — Xweather cloud-to-ground confirmation", () => {
  const fixture = JSON.parse(readFileSync(path.join(__dirname, "fixtures", "xweather-lightning-closest.json"), "utf8"));
  const monthKey = () => {
    const now = new Date();
    return `xweather_queries_${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  const xweather = vi.fn();

  beforeEach(() => {
    state.flashes = { data: [nearFlash()], error: null };
    fetchDryConditions.mockResolvedValue({ humidity: 35, recentRainMm: 0 });
    xweather.mockReset().mockImplementation(async () => new Response(JSON.stringify(fixture), { status: 200 }));
    vi.stubGlobal("fetch", xweather);
  });

  it("adds the confirmed cloud-to-ground strike with attribution, and counts the query", async () => {
    process.env.XWEATHER_API_KEY = "someid_somesecret";

    await GET(request());

    const msg = String(sendMessage.mock.calls[0][1]);
    expect(msg).toMatch(/Rayo nube-tierra confirmado a ~9 km/);
    expect(msg).toContain("powered by Vaisala Xweather");
    expect(xweather).toHaveBeenCalledTimes(1);
    expect(state.upserts).toContainEqual({
      table: "_clara_config",
      row: expect.objectContaining({ key: monthKey(), value: "1" }),
    });
  });

  it("without credentials it never asks Xweather and the alert stays as it was", async () => {
    await GET(request());

    expect(xweather).not.toHaveBeenCalled();
    expect(String(sendMessage.mock.calls[0][1])).not.toMatch(/nube-tierra/);
  });

  it("once the month's budget is used it stops asking, and still alerts", async () => {
    process.env.XWEATHER_API_KEY = "someid_somesecret";
    state.config[monthKey()] = "1350";

    await GET(request());

    expect(xweather).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("an Xweather failure never blocks the alert", async () => {
    process.env.XWEATHER_API_KEY = "someid_somesecret";
    xweather.mockRejectedValue(new Error("network down"));

    await GET(request());

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(String(sendMessage.mock.calls[0][1])).not.toMatch(/nube-tierra/);
  });
});
