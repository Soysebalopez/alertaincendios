import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

/**
 * The home hero refreshes itself through a Supabase Realtime websocket
 * (hero-auto-refresh.tsx). Until 2026-09-14 connect-src allowed only
 * https://*.supabase.co, so the browser blocked the wss:// connection and the
 * hero never updated on its own, with no visible error.
 */
async function directive(name: string): Promise<string[]> {
  const rules = (await nextConfig.headers?.()) ?? [];
  const csp =
    rules
      .flatMap((rule) => rule.headers)
      .find((header) => header.key === "Content-Security-Policy")?.value ?? "";
  const found = csp
    .split(";")
    .map((part) => part.trim().split(/\s+/))
    .find(([key]) => key === name);
  return found ? found.slice(1) : [];
}

describe("Content-Security-Policy", () => {
  it("lets the browser open the Supabase Realtime websocket the home hero listens on", async () => {
    expect(await directive("connect-src")).toContain("wss://*.supabase.co");
  });

  it("keeps the Supabase REST origin that the dashboard login uses", async () => {
    expect(await directive("connect-src")).toContain("https://*.supabase.co");
  });
});
