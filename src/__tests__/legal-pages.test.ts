import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * WHI-929 — terms, privacy and disclaimer. Before 2026-10-02 the site had none
 * of the three while it took people's location through Telegram and sent
 * safety alerts.
 */
const root = path.join(__dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

describe("legal pages", () => {
  it("are linked from the footer of every page and listed in the sitemap", () => {
    const links = read("components/legal-page.tsx");
    const sitemap = read("app/sitemap.ts");
    for (const href of ["/aviso", "/terminos", "/privacidad"]) {
      expect(links, `${href} missing from LEGAL_LINKS`).toContain(`href: "${href}"`);
      expect(sitemap, `${href} missing from the sitemap`).toContain(`"${href}"`);
    }
    expect(read("components/footer.tsx")).toContain("LEGAL_LINKS.map");
  });

  it("the disclaimer says the operational decision belongs to the competent authority", () => {
    expect(read("app/(main)/aviso/page.tsx")).toMatch(/son siempre de los organismos competentes/);
  });

  /**
   * 🔴 The privacy page says /cancelar deletes the subscription (location,
   * city, preferences) and that usage logs and alert answers stay. That is
   * true only while /cancelar deletes exactly the `subscribers` row. If it
   * starts deleting more — or less — this fails, so the page gets updated in
   * the same change. A privacy policy that promises more than the system does
   * is worse than none.
   */
  it("what the privacy page promises about /cancelar matches what the bot does", () => {
    const bot = read("app/api/bot/telegram/route.ts");
    const start = bot.indexOf("async function handleCancelar(");
    expect(start).toBeGreaterThanOrEqual(0);
    const body = bot.slice(start, bot.indexOf("\n}\n", start));
    const deletedTables = [...body.matchAll(/from\("([a-z_]+)"\)\.delete\(\)/g)].map((m) => m[1]);
    expect(deletedTables).toEqual(["subscribers"]);

    const privacy = read("app/(main)/privacidad/page.tsx");
    expect(privacy).toMatch(/borramos tu suscripción/);
    expect(privacy).toMatch(/El registro de uso y tus respuestas a las alertas quedan guardados/);
  });
});
