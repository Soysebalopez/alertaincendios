import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * WHI-907 part 4 — hourly cron that stores the observed wind at Bahía Blanca
 * airport (SAZB). The table is created only after Seba approves the migration
 * (checkpoint C2), so a missing table must not make the cron fail.
 */
const upsert = vi.fn();
vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    from: (table: string) => ({
      upsert: (rows: unknown, options: unknown) => upsert(table, rows, options),
    }),
  }),
}));

import { GET } from "@/app/api/metar-sync/route";

const fixture = readFileSync(path.join(__dirname, "fixtures", "metar-sazb.json"), "utf8");
const fixtureRecords = JSON.parse(fixture) as unknown[];

function request(secret?: string) {
  return new Request(`https://x/api/metar-sync${secret ? `?secret=${secret}` : ""}`);
}

beforeEach(() => {
  vi.unstubAllGlobals();
  upsert.mockReset();
  process.env.CRON_SECRET = "test-secret";
  vi.stubGlobal("fetch", vi.fn(async () => new Response(fixture, { status: 200 })));
});

describe("GET /api/metar-sync", () => {
  it("rejects calls without the cron secret", async () => {
    const res = await GET(request());
    expect(res.status).toBe(401);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("stores every parsed SAZB observation, idempotent by station + time", async () => {
    upsert.mockResolvedValue({ error: null });
    const res = await GET(request("test-secret"));
    expect(res.status).toBe(200);
    expect((await res.json()).stored).toBe(fixtureRecords.length);

    const [table, rows, options] = upsert.mock.calls[0];
    expect(table).toBe("wind_observations");
    expect(options).toMatchObject({ onConflict: "station,observed_at" });
    const stored = rows as Array<Record<string, unknown>>;
    expect(stored).toHaveLength(fixtureRecords.length);
    expect(stored[0]).toMatchObject({ station: "SAZB", variable: false });
    expect(typeof stored[0].wind_kmh).toBe("number");
  });

  it.each([
    ["PGRST205", "Could not find the table 'public.wind_observations' in the schema cache"],
    ["42P01", 'relation "public.wind_observations" does not exist'],
  ])("reports a missing table (%s) as skipped instead of failing the cron", async (code, message) => {
    upsert.mockResolvedValue({ error: { code, message } });
    const res = await GET(request("test-secret"));
    expect(res.status).toBe(200);
    expect((await res.json()).skipped).toBe("table_missing");
  });

  it("fails loudly on any other database error", async () => {
    upsert.mockResolvedValue({ error: { code: "57014", message: "canceling statement due to statement timeout" } });
    const res = await GET(request("test-secret"));
    expect(res.status).toBe(500);
  });
});
