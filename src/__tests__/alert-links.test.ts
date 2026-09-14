import { describe, expect, it } from "vitest";
import { alertMapLinks } from "@/lib/alert-links";

/**
 * WHI-907 part 9 — a fire alert near Bahía Blanca links to our own map,
 * centered on the fire, where the smoke cone shows which way it is heading.
 * Everywhere else the alert keeps exactly the Google Maps link it had.
 */
describe("alertMapLinks", () => {
  it("near Bahía Blanca: 'Ver hacia dónde va' on our map first, then Google Maps", () => {
    expect(alertMapLinks(-38.61, -62.4)).toBe(
      `🗺️ <a href="https://alertaforestal.org/bahia-blanca?foco=-38.6100,-62.4000">Ver hacia dónde va</a>\n` +
        `📌 <a href="https://www.google.com/maps?q=-38.61,-62.4&z=12">Ver en Google Maps</a>`
    );
  });

  it("elsewhere: only the Google Maps link, unchanged", () => {
    expect(alertMapLinks(-41.13, -71.3)).toBe(
      `📌 <a href="https://www.google.com/maps?q=-41.13,-71.3&z=12">Ver en Google Maps</a>`
    );
  });
});
