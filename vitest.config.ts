import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    // Mismo alias que tsconfig — necesario para que los tests resuelvan
    // `@/lib/...` igual que el código bajo test.
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    // Solo tests bajo src/__tests__. Mantener separado del bundle del producto.
    include: ["src/__tests__/**/*.test.ts"],
    environment: "node",
    // No queremos que vitest se mate intentando bundlear el client de Supabase
    // o cualquier dependencia de Next runtime — los tests son unitarios puros.
    deps: { interopDefault: true },
  },
});
