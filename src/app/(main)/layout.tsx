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
    <div className="flex flex-col min-h-[100dvh] relative">
      <WebsiteJsonLd />
      <div className="clara-ambient" aria-hidden />
      <EmberParticles />
      <div className="relative z-[3]">
        <Nav />
      </div>
      <main className="relative z-[3] flex-1 clara-fade-in">{children}</main>
      <div className="relative z-[3]">
        <Footer />
      </div>
    </div>
  );
}
