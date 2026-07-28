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

// Forest polygons under @/lib/firms are `server-only` and cannot load in vitest.
vi.mock("@/lib/firms", () => ({ fetchFires: vi.fn(async () => []) }));

const BAHIA = { lat: -38.717, lng: -62.272, name: "Bahía Blanca", admin1: "Buenos Aires" };
vi.mock("@/lib/geocode", () => ({
  reverseGeocode: vi.fn(async () => BAHIA),
  geocodeCity: vi.fn(async () => BAHIA),
}));

// Row the subscribers table hands back; tests flip `role` per scenario.
const sub = { role: "civilian", lat: BAHIA.lat, lng: BAHIA.lng, prevention_mode: "off" };

type Row = Record<string, unknown>;
interface QueryStub {
  select(): QueryStub;
  eq(): QueryStub;
  in(): QueryStub;
  limit(): QueryStub;
  update(): QueryStub;
  delete(): QueryStub;
  insert(): Promise<{ data: null; error: null }>;
  upsert(): Promise<{ data: null; error: null }>;
  maybeSingle(): Promise<{ data: Row | null }>;
  single(): Promise<{ data: Row | null }>;
  then(resolve: (v: { data: Row[] }) => void): void;
}

function buildQuery(table: string): QueryStub {
  const q: QueryStub = {
    select: () => q,
    eq: () => q,
    in: () => q,
    limit: () => q,
    update: () => q,
    delete: () => q,
    insert: async () => ({ data: null, error: null }),
    upsert: async () => ({ data: null, error: null }),
    maybeSingle: async () => ({ data: table === "subscribers" ? sub : null }),
    single: async () => ({ data: null }),
    then: (resolve) => resolve({ data: [] }),
  };
  return q;
}
vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    from: (t: string) => buildQuery(t),
    rpc: async () => ({ data: null, error: null }),
  }),
}));

import { POST } from "@/app/api/bot/telegram/route";

function send(body: Record<string, unknown>) {
  return POST(
    new Request("https://x/api/bot/telegram", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as never
  );
}

const CHAT = 555;
const locationMsg = { message: { chat: { id: CHAT }, location: { latitude: BAHIA.lat, longitude: BAHIA.lng } } };
const textMsg = (text: string) => ({ message: { chat: { id: CHAT }, text } });

/**
 * The bot addressed every subscriber as "vecino" / "suscripto" — masculine by
 * default. A real subscriber named María would have been greeted as "vecino".
 * The product may keep a role called "bombero"; it must not assume the gender
 * of the person reading the message.
 */
const GENDERED =
  /\b(vecino|vecina|suscripto|suscripta|suscrito|suscrita|bienvenido|bienvenida|registrado|registrada)\b/i;

function replies(): string {
  return sendMessage.mock.calls.map((c) => String(c[1])).join("\n---\n");
}

describe("bot copy never assumes the subscriber's gender", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    sub.role = "civilian";
  });

  it("greets a shared location without a gendered noun", async () => {
    await send(locationMsg);

    expect(replies()).toContain("Bahía Blanca");
    expect(replies()).not.toMatch(GENDERED);
  });

  it("greets /ciudad without a gendered noun", async () => {
    await send(textMsg("/ciudad Bahia Blanca"));

    expect(replies()).toContain("Bahía Blanca");
    expect(replies()).not.toMatch(GENDERED);
  });

  it("describes the project without a gendered noun", async () => {
    await send(textMsg("/about"));

    expect(replies()).not.toMatch(GENDERED);
  });

  it("lists the commands without a gendered noun", async () => {
    await send(textMsg("/help"));

    expect(replies()).not.toMatch(GENDERED);
  });

  it("confirms leaving a cuartel without a gendered noun", async () => {
    sub.role = "fireman";

    await send(textMsg("/dejarcuartel"));

    expect(replies()).not.toMatch(GENDERED);
  });

  it("refuses /dejarcuartel for a non-fireman without a gendered noun", async () => {
    await send(textMsg("/dejarcuartel"));

    expect(replies()).not.toMatch(GENDERED);
  });
});
