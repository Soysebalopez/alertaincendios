import { Nav } from "@/components/nav";
import { EmberParticles } from "@/components/ember-particles";

export default function MapaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col h-[100dvh] grid-overlay scanline relative overflow-hidden">
      <EmberParticles />
      <Nav />
      {children}
    </div>
  );
}
