import { Nav } from "@/components/nav";
import { EmberParticles } from "@/components/ember-particles";

export default function ProvinciaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-[100dvh] relative">
      <div className="clara-ambient" aria-hidden />
      <EmberParticles />
      <div className="relative z-[3]">
        <Nav />
      </div>
      <div className="relative z-[3]">{children}</div>
    </div>
  );
}
