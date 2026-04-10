import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { EmberParticles } from "@/components/ember-particles";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-[100dvh] grid-overlay scanline relative">
      <EmberParticles />
      <Nav />
      {children}
      <Footer />
    </div>
  );
}
