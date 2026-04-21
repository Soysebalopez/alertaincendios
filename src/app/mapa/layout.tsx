import { Nav } from "@/components/nav";
import { EmberParticles } from "@/components/ember-particles";

export default function MapaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col h-[100dvh] relative overflow-hidden">
      <div className="clara-ambient" aria-hidden />
      <EmberParticles />
      <div className="relative z-[3]">
        <Nav />
      </div>
      <div className="relative z-[3] flex-1">{children}</div>
    </div>
  );
}
