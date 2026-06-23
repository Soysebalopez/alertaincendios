# Lenguaje ciudadano para las clases de peligro FWI

**Fecha:** 2026-06-23
**Estado:** Diseño aprobado (brainstorming) — pendiente plan de implementación
**Disparador:** Sub-proyecto 4 (último) del milestone *validación → precisión → calibración → comprensión*. Con las clases ya calibradas por zona, la página `/provincia` muestra el nivel (`bajo→extremo`) como un pill sin explicación, junto a jerga técnica (`FWI 23`, `HR 42%`). Un ciudadano no sabe qué significa ni qué hacer. Este es el paso de **comprensión**: traducir el nivel a lenguaje claro y accionable — el corazón de la diferencia con la página oficial del SMN (ellos publican el número; nosotros lo hacemos entender).

---

## 1. Problema y oportunidad

La página de peligro ya es correcta y está calibrada, pero **habla en técnico**. El pill dice "alto" y al lado "FWI 23" — ninguno de los dos le dice a una persona qué riesgo corre ni qué debería hacer hoy. El valor del producto no es el número (ese es el del SMN, a propósito): es **distribuir + hacer entender**. Agregar, por cada nivel, *qué significa* y *qué hacer* convierte el semáforo en algo accionable.

## 2. Objetivos / No-objetivos

**Objetivos:**
- Por cada clase (`bajo→extremo`): una frase de **qué significa** (riesgo) + una **recomendación de acción** concreta.
- Mostrarlo en el **resumen general** del panel, bajo el pill del peor nivel del día seleccionado.
- Copy en español, claro, no alarmista pero serio en los niveles altos; reutilizable (genérico por clase, no por zona).

**No-objetivos:**
- **No** sacar `/provincia` de privada — la página sigue `noindex` para verla funcionando antes de publicar (decisión explícita del usuario; "publicar" es un paso posterior aparte).
- **No** tocar el FWI crudo, `HR`, ni "FWI canadiense (SNMF)" (la jerga queda; alcance acotado).
- No tocar el cálculo, las clases, los umbrales, ni el copy por-zona.
- No copy diferenciado por rol (civilian/fireman) — la página es ciudadana.

## 3. Decisiones del brainstorming

| Decisión | Elegido | Razón |
|---|---|---|
| **Contenido** | Descripción del nivel + recomendación de acción | Lo accionable es el diferencial; "qué significa" + "qué hacer". |
| **Ubicación** | Resumen general (bajo el pill del peor nivel del día) | Una vez, prominente, la acción principal del día; sin repetir texto largo por zona. |
| **Granularidad del copy** | Genérico por clase | "Alto" significa lo mismo en cualquier zona; 5 clases × {summary, action}. |
| **Jerga / FWI crudo** | Sin cambios | Alcance acotado; no se eligió reescribir jerga. |
| **Privacidad** | Mantener `noindex` | Verla funcionando antes de publicar. |

## 4. Arquitectura

**En una línea:** un mapa de copy por clase en `fire-danger.ts` + un helper, consumido por el panel bajo el resumen general.

### 4.1 `src/lib/fire-danger.ts` (client-safe, donde ya viven los helpers de clase)
- `DANGER_COPY: Record<DangerClass, { summary: string; action: string }>` — los 5 niveles.
- `dangerCopy(c: DangerClass): { summary: string; action: string }` — accessor.
- Sin nuevas dependencias; junto a `dangerPillTone`/`worstClass`/`dangerColor`.

### 4.2 `src/components/danger/danger-panel.tsx`
- En el bloque de resumen general (donde está `<Pill tone={dangerPillTone(overall)}>{overall}</Pill>`), debajo del pill, renderizar `dangerCopy(overall).summary` y `dangerCopy(overall).action` con estilos del panel existentes (`clp-sub` o similar; sin lenguaje visual nuevo).
- `overall` = `worstClass` de las zonas del día seleccionado (ya calculado).

### 4.3 El copy (contenido aprobado)
| Clase | summary | action |
|---|---|---|
| bajo | Las condiciones son poco favorables para que un fuego se inicie o se propague. | Mantené las precauciones de siempre con el fuego. |
| moderado | Un fuego puede iniciarse y avanzar si hay sequedad o viento. | Cuidado al usar fuego al aire libre. Apagá bien colillas y brasas. |
| alto | Las condiciones favorecen que un incendio se inicie y se propague rápido. | Evitá fuego al aire libre, quemas y asados. Reportá cualquier humo. |
| muy alto | Un incendio puede iniciarse con facilidad y avanzar rápido y con intensidad. | No hagas ningún fuego al aire libre. Atento a avisos de las autoridades. |
| extremo | Condiciones críticas: cualquier chispa puede provocar un incendio difícil de controlar. | Prohibido todo fuego al aire libre. Preparate por si hay que evacuar y seguí a las autoridades. |

## 5. Data flow

```
worstClass(zonas del día) -> overall (DangerClass)
  -> dangerCopy(overall) -> {summary, action}
  -> render bajo el pill del resumen general
```
Todo client-side, sin red ni cómputo nuevo. El copy es estático en el bundle.

## 6. Manejo de errores y bordes
- `overall` siempre es una `DangerClass` válida (`worstClass` devuelve una de las 5; default "bajo"), así que `dangerCopy` siempre encuentra copy — no hay caso de "clase sin texto".
- Día "bajo" → copy tranquilizador (correcto; no todo es alarma).
- Sin datos de pronóstico (forecast vacío) → el panel ya hace fallback a "bajo"; el copy de "bajo" aplica.

## 7. Testing
- `dangerCopy`: para cada una de las 5 clases devuelve `summary` y `action` no vacíos; las 5 clases están cubiertas (sin huecos).
- Verificación visual (manual, página privada): el resumen muestra el texto correcto al cambiar de día/nivel.

## 8. Entregables
- `src/lib/fire-danger.ts`: `DANGER_COPY` + `dangerCopy` + test (vitest).
- `src/components/danger/danger-panel.tsx`: render del copy bajo el resumen.
