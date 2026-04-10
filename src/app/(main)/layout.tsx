import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { EmberParticles } from "@/components/ember-particles";
import { WebsiteJsonLd } from "@/components/jsonld";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-[100dvh] grid-overlay scanline relative">
      <WebsiteJsonLd />
      <EmberParticles />
      <Nav />
      {children}
      <Footer />
    </div>
  );
}
