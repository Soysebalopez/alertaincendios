import { describe, it, expect, vi, beforeEach } from "vitest";

const sendMessage = vi.fn();
vi.mock("@/lib/telegram", () => ({
  sendMessage: (...a: unknown[]) => {
    sendMessage(...a);
    return Promise.resolve({ ok: true, status: 200, blocked: false });
  },
  answerCallbackQuery: vi.fn(async () => ({ ok: true })),
  editMessageText: vi.fn(async () => ({ ok: true })),
  deleteMessage: vi.fn(async () => ({ ok: true })),
  escapeHtml: (s: string) => s,
}));

// The route imports fetchFires for /estado; its forest polygons are
// `server-only` and cannot be loaded by vitest. Unused by the location flow.
vi.mock("@/lib/firms", () => ({ fetchFires: vi.fn(async () => []) }));

const reverseGeocode = vi.fn();
vi.mock("@/lib/geocode", () => ({
  reverseGeocode: (...a: unknown[]) => reverseGeocode(...a),
  geocodeCity: vi.fn(async () => null),
}));

// Records every write so the tests can assert what the bot persisted.
const upserts: Array<Record<string, unknown>> = [];

interface QueryStub {
  select: () => QueryStub;
  eq: () => QueryStub;
  in: () => QueryStub;
  limit: () => QueryStub;
  delete: () => QueryStub;
  insert: () => Promise<{ data: null; error: null }>;
  upsert: (row: Record<string, unknown>) => Promise<{ data: null; error: null }>;
  maybeSingle: () => Promise<{ data: null }>;
  single: () => Promise<{ data: null }>;
  then: (resolve: (v: unknown) => unknown) => unknown;
}

function buildQuery(table: string): QueryStub {
  const q: QueryStub = {
    select: () => q,
    eq: () => q,
    in: () => q,
    limit: () => q,
    delete: () => q,
    insert: async () => ({ data: null, error: null }),
    upsert: async (row: Record<string, unknown>) => {
      if (table === "subscribers") upserts.push(row);
      return { data: null, error: null };
    },
    maybeSingle: async () => ({ data: null }),
    single: async () => ({ data: null }),
    then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null }),
  };
  return q;
}

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({ from: (table: string) => buildQuery(table) }),
}));

import { POST } from "@/app/api/bot/telegram/route";

function locationUpdate(chatId: number, latitude: number, longitude: number) {
  return new Request("https://x/api/bot/telegram", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: { chat: { id: chatId }, location: { latitude, longitude } } }),
  }) as never;
}

function messagesSent(): string {
  return sendMessage.mock.calls.map((c) => String(c[1])).join("\n---\n");
}

describe("shared location outside the covered area", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upserts.length = 0;
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    reverseGeocode.mockResolvedValue({
      lat: 40.458,
      lng: 0.354,
      name: "Cálig",
      admin1: "Valenciana, Comunidad",
    });
  });

  // Real subscriber that prompted this fix: a Telegram user in Càlig, Spain.
  it("does not subscribe a user located outside Argentina", async () => {
    await POST(locationUpdate(922907013, 40.458, 0.354));

    expect(upserts).toHaveLength(0);
  });

  it("explains the coverage instead of promising alerts", async () => {
    await POST(locationUpdate(922907013, 40.458, 0.354));

    const sent = messagesSent();
    expect(sent).toContain("Argentina");
    expect(sent).not.toContain("Listo, vecino");
  });

  it("subscribes a user inside Argentina and names their locality", async () => {
    reverseGeocode.mockResolvedValue({
      lat: -38.717,
      lng: -62.272,
      name: "Bahía Blanca",
      admin1: "Buenos Aires",
    });

    await POST(locationUpdate(159946020, -38.717, -62.272));

    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({ chat_id: 159946020, city_name: "Bahía Blanca" });
    expect(messagesSent()).toContain("Bahía Blanca");
  });

  it("still subscribes when the place name cannot be resolved", async () => {
    reverseGeocode.mockResolvedValue(null);

    await POST(locationUpdate(159946020, -38.717, -62.272));

    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({ city_name: "-38.72, -62.27" });
  });
});
