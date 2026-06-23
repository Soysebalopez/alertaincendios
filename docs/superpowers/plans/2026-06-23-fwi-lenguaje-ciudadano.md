# FWI Citizen-Language Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show, under the overall danger pill in the province panel, a plain-language line for each level — what it means and what to do — turning the calibrated class into something a citizen can act on.

**Architecture:** A static per-class copy map (`DANGER_COPY`) + accessor (`dangerCopy`) added to the client-safe `src/lib/fire-danger.ts` (where the class helpers already live). `danger-panel.tsx` renders `summary` + `action` of the day's worst class beneath the existing pill. No new deps, no network, no compute. Page stays private (`noindex` untouched).

**Tech Stack:** Next.js (App Router, client component), TypeScript, vitest.

**Conventions:**
- TS tests: `npm test` (vitest), tests in `src/__tests__/`. The existing `src/__tests__/fire-danger.test.ts` imports pure helpers from `../lib/fire-danger`.
- Typecheck: `npx tsc --noEmit`.
- Commit messages: conventional prefix, English, end with the `Co-Authored-By` trailer.

---

### Task 1: `DANGER_COPY` + `dangerCopy` in `fire-danger.ts`

The per-class copy map and accessor — pure, testable.

**Files:**
- Modify: `src/lib/fire-danger.ts` (append near `dangerPillTone`/`worstClass`)
- Test: `src/__tests__/fire-danger.test.ts` (append)

- [ ] **Step 1: Write the failing test (append to `src/__tests__/fire-danger.test.ts`)**

```typescript
import { DANGER_COPY, dangerCopy } from "../lib/fire-danger";

describe("danger copy (citizen language)", () => {
  it("has non-empty summary + action for every class", () => {
    for (const c of DANGER_CLASSES) {
      const copy = dangerCopy(c);
      expect(copy.summary.length).toBeGreaterThan(0);
      expect(copy.action.length).toBeGreaterThan(0);
    }
  });

  it("covers exactly the five classes with no gaps", () => {
    expect(Object.keys(DANGER_COPY).sort()).toEqual([...DANGER_CLASSES].sort());
  });

  it("returns the level-specific copy", () => {
    expect(dangerCopy("extremo").summary).toMatch(/cr[ií]tic/i);
    expect(dangerCopy("bajo").action).toMatch(/precauciones/i);
  });
});
```

Note: `DANGER_CLASSES` is already imported at the top of the existing test file — reuse it; only add the `DANGER_COPY, dangerCopy` import.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/__tests__/fire-danger.test.ts`
Expected: FAIL — `DANGER_COPY`/`dangerCopy` not exported from `../lib/fire-danger`.

- [ ] **Step 3: Implement (append to `src/lib/fire-danger.ts`)**

```typescript
// Citizen-language copy per danger class: what it means + what to do. Shown under
// the overall pill in the danger panel. Generic by class (a level means the same
// in any zone). Spanish, plain, escalating in tone.
export const DANGER_COPY: Record<DangerClass, { summary: string; action: string }> = {
  bajo: {
    summary: "Las condiciones son poco favorables para que un fuego se inicie o se propague.",
    action: "Mantené las precauciones de siempre con el fuego.",
  },
  moderado: {
    summary: "Un fuego puede iniciarse y avanzar si hay sequedad o viento.",
    action: "Cuidado al usar fuego al aire libre. Apagá bien colillas y brasas.",
  },
  alto: {
    summary: "Las condiciones favorecen que un incendio se inicie y se propague rápido.",
    action: "Evitá fuego al aire libre, quemas y asados. Reportá cualquier humo.",
  },
  "muy alto": {
    summary: "Un incendio puede iniciarse con facilidad y avanzar rápido y con intensidad.",
    action: "No hagas ningún fuego al aire libre. Atento a avisos de las autoridades.",
  },
  extremo: {
    summary: "Condiciones críticas: cualquier chispa puede provocar un incendio difícil de controlar.",
    action: "Prohibido todo fuego al aire libre. Preparate por si hay que evacuar y seguí a las autoridades.",
  },
};

export function dangerCopy(c: DangerClass): { summary: string; action: string } {
  return DANGER_COPY[c];
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/__tests__/fire-danger.test.ts`
Expected: PASS (existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/fire-danger.ts src/__tests__/fire-danger.test.ts
git commit -m "feat: per-class citizen-language copy for danger levels

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Render the copy in the danger panel

Show the overall level's `summary` + `action` beneath the pill in the summary block.

**Files:**
- Modify: `src/components/danger/danger-panel.tsx`

- [ ] **Step 1: Add the import**

In `src/components/danger/danger-panel.tsx`, the existing import block pulls helpers from `@/lib/fire-danger`:
```typescript
import {
  dangerPillTone,
  worstClass,
  forecastDateLabel,
  type ProvinceDanger,
} from "@/lib/fire-danger";
```
Add `dangerCopy` to it:
```typescript
import {
  dangerPillTone,
  worstClass,
  forecastDateLabel,
  dangerCopy,
  type ProvinceDanger,
} from "@/lib/fire-danger";
```

- [ ] **Step 2: Render the copy under the overall pill**

The summary block currently is (around lines 34–40):
```tsx
      <div className="clp-block">
        <div className="clp-title">{data.provinceName}</div>
        <div className="clp-sub">Peligro de incendio · {forecastDateLabel(dateStr, today)}</div>
        <div style={{ marginTop: 8 }}>
          <Pill tone={dangerPillTone(overall)}>{overall}</Pill>
        </div>
      </div>
```
Add the copy right after the pill's wrapping `<div>`, still inside the `clp-block`:
```tsx
      <div className="clp-block">
        <div className="clp-title">{data.provinceName}</div>
        <div className="clp-sub">Peligro de incendio · {forecastDateLabel(dateStr, today)}</div>
        <div style={{ marginTop: 8 }}>
          <Pill tone={dangerPillTone(overall)}>{overall}</Pill>
        </div>
        <div className="clp-sub" style={{ marginTop: 8 }}>{dangerCopy(overall).summary}</div>
        <div className="clp-sub" style={{ marginTop: 4, fontWeight: 600 }}>{dangerCopy(overall).action}</div>
      </div>
```

- [ ] **Step 3: Typecheck and run the suite**

Run: `npx tsc --noEmit`
Expected: no errors.
Run: `npm test`
Expected: all green (no regressions).

- [ ] **Step 4: Commit**

```bash
git add src/components/danger/danger-panel.tsx
git commit -m "feat: show what-it-means + what-to-do under the danger pill

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5: Visual check (manual, private page)**

Run the dev server and open the (private) province page, e.g. `/provincia/tierra-del-fuego`. Move the forecast-day slider and confirm the summary + action text under the pill updates with the worst level of the day. (The page is `noindex`; this stays private — publishing is a separate later step.)

---

## Final Verification
- [ ] `npm test` green (the 3 new copy tests + no regressions).
- [ ] `npx tsc --noEmit` clean.
- [ ] Panel shows the level's summary + action under the overall pill; updates with the slider.
- [ ] Page still `noindex` (not touched); FWI/`HR`/sources text unchanged.

## Notes / deferred (separate later steps)
- **Making `/provincia` public** (remove `noindex` + add to sitemap + robots) — explicit later step after seeing it work privately.
- Rewriting the technical jargon (`FWI`, `HR`, "FWI canadiense (SNMF)") — out of scope here.
- Per-zone copy or role-specific (civilian/fireman) wording — not in this sub-project.
