import { Nav } from "@/components/nav";
import { EmberParticles } from "@/components/ember-particles";

export default function MapaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Antes esto era `h-[100dvh] overflow-hidden` para que el mapa ocupara
  // toda la pantalla. Ahora hay sección interpretativa debajo del mapa, así
  // que la página tiene que poder scrollear.
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
