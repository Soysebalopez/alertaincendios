import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import sitemap from "@/app/sitemap";

/**
 * WHI-907 part 9 — Bahía Blanca gets its own page. There must never be two
 * Bahía pages with different content: the generic city URL redirects to the
 * new one, and the sitemap lists only the new one.
 */
describe("Bahía Blanca page routes", () => {
  it("the generic city URL redirects permanently to /bahia-blanca", async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];
    expect(redirects).toContainEqual({
      source: "/ciudad/buenos-aires/bahia-blanca",
      destination: "/bahia-blanca",
      permanent: true,
    });
  });

  it("the sitemap lists /bahia-blanca once, and not the generic city URL", () => {
    const paths = sitemap().map((entry) => new URL(entry.url).pathname);
    expect(paths.filter((p) => p === "/bahia-blanca")).toHaveLength(1);
    expect(paths).not.toContain("/ciudad/buenos-aires/bahia-blanca");
  });
});
