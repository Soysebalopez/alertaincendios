import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * WHI-907 part 9 — "Recibí las alertas de Bahía Blanca" on the city page opens
 * t.me/alertaforestal_bot?start=ciudad-bahia-blanca. Pressing Start must
 * subscribe that chat to Bahía Blanca's coordinates (same result as
 * /ciudad) and record the origin, while campaign links (`src-<slug>`) keep
 * attributing a later subscription as before.
 */
const sendMessage = vi.fn<(...args: unknown[]) => Promise<{ ok: boolean; status: number; blocked: boolean }>>(
  async () => ({ ok: true, status: 200, blocked: false })
);
const geocodeCity = vi.fn();

vi.mock("@/lib/telegram", () => ({
  sendMessage: (...args: unknown[]) => sendMessage(...args),
  answerCallbackQuery: vi.fn(),
  editMessageText: vi.fn(),
  deleteMessage: vi.fn(),
  escapeHtml: (s: string) => s,
}));
vi.mock("@/lib/geocode", () => ({
  geocodeCity: (...args: unknown[]) => geocodeCity(...args),
  reverseGeocode: vi.fn(),
}));
vi.mock("@/lib/firms", () => ({ fetchFires: vi.fn(async () => []) }));
vi.mock("@/lib/logger", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};

function from(table: string) {
  const filters: Array<[string, unknown]> = [];
  const rows = () => (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v));
  const q: Record<string, unknown> = {};
  for (const method of ["select", "order", "limit", "not", "in", "gte", "lte", "delete"]) q[method] = () => q;
  q.eq = (column: string, value: unknown) => {
    filters.push([column, value]);
    return q;
  };
  q.maybeSingle = async () => ({ data: rows().at(-1) ?? null, error: null });
  q.single = q.maybeSingle;
  q.insert = async (row: Row) => {
    (tables[table] ??= []).push(row);
    return { error: null };
  };
  q.upsert = async (row: Row) => {
    const list = (tables[table] ??= []);
    const index = list.findIndex((r) => r.chat_id === row.chat_id);
    if (index >= 0) list[index] = { ...list[index], ...row };
    else list.push(row);
    return { error: null };
  };
  q.then = (resolve: (value: { data: Row[]; error: null }) => void) => resolve({ data: rows(), error: null });
  return q;
}
vi.mock("@/lib/supabase", () => ({ getSupabase: () => ({ from }) }));

import { POST } from "@/app/api/bot/telegram/route";

const CHAT = 42;
function say(text: string) {
  return POST(
    new NextRequest("https://x/api/bot/telegram", {
      method: "POST",
      headers: { "x-telegram-bot-api-secret-token": "test-secret" },
      body: JSON.stringify({ message: { chat: { id: CHAT }, text } }),
    })
  );
}
const subscriber = () => (tables.subscribers ?? []).find((r) => r.chat_id === CHAT) ?? null;
const lastMessage = () => String(sendMessage.mock.calls.at(-1)?.[1] ?? "");

beforeEach(() => {
  for (const name of Object.keys(tables)) delete tables[name];
  sendMessage.mockClear();
  geocodeCity.mockReset();
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  process.env.TELEGRAM_WEBHOOK_SECRET = "test-secret";
});

describe("/start deep links", () => {
  it("ciudad-bahia-blanca subscribes to Bahía Blanca and records where it came from", async () => {
    await say("/start ciudad-bahia-blanca");
    expect(subscriber()).toMatchObject({
      lat: -38.7196,
      lng: -62.2724,
      city_name: "Bahia Blanca",
      source: "campaign:ciudad-bahia-blanca",
    });
    expect(lastMessage()).toContain("Listo, ya te tengo en Bahia Blanca, Buenos Aires");
    expect(geocodeCity).not.toHaveBeenCalled();
  });

  it("a plain /start only welcomes, it subscribes nobody", async () => {
    await say("/start");
    expect(subscriber()).toBeNull();
    expect(lastMessage()).toContain("Para empezar");
  });

  it("an ambiguous city (two Rawsons) welcomes instead of guessing", async () => {
    await say("/start ciudad-rawson");
    expect(subscriber()).toBeNull();
    expect(lastMessage()).toContain("Para empezar");
  });

  it("a campaign link still attributes the subscription made afterwards", async () => {
    geocodeCity.mockResolvedValue({ lat: -37.32, lng: -59.13, name: "Tandil", admin1: "Buenos Aires" });
    await say("/start src-radio-lu2");
    expect(subscriber()).toBeNull();
    await say("/ciudad Tandil");
    expect(subscriber()).toMatchObject({ city_name: "Tandil", source: "campaign:radio-lu2" });
  });
});
