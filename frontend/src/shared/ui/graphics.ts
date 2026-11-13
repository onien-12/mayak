import { create } from 'zustand';

/**
 * Rendering tier. `full` — every effect and animation (the default); `lite` — for weak
 * devices: no backdrop blur, lighter shadows, no infinite decorative animations, fades
 * instead of springs, simpler map markers and MapGL's light graphics preset. Layout,
 * content, colours and interactions are the same in both.
 */
export type GraphicsTier = 'full' | 'lite';

/** What the person picked in the profile settings («Графика»). */
export type GraphicsChoice = 'auto' | GraphicsTier;

/** The automatic decision, remembered between visits (see `graphicsProbe.ts`). */
export interface GraphicsVerdict {
  tier: GraphicsTier;
  /** `hints` — decided from the hardware hints alone; `frames` — from measured frame times. */
  reason: 'hints' | 'frames';
  /** When it was made, ms since epoch. */
  at: number;
}

interface StoredGraphics {
  choice: GraphicsChoice;
  verdict: GraphicsVerdict | null;
}

const STORAGE_KEY = 'mayak-graphics';
/** A remembered automatic decision is re-checked after this long (new browser, new laptop). */
const VERDICT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Cheap hardware hints (no measurement needed):
 * - strong — 2 logical cores or fewer, or ≤ 2 GB of memory (`navigator.deviceMemory`,
 *   Chromium only): start in `lite` right away;
 * - weak — ≤ 4 cores, ≤ 4 GB, or «reduce motion» in the OS (often switched on to speed up
 *   an old computer): stay in `full`, but a single slow measurement window is enough to
 *   switch (see `graphicsProbe.ts`).
 */
export type HardwareHint = 'strong' | 'weak' | 'none';

export function hardwareHint(): HardwareHint {
  const cores = navigator.hardwareConcurrency || 0;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 0;
  if ((cores > 0 && cores <= 2) || (memory > 0 && memory <= 2)) return 'strong';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if ((cores > 0 && cores <= 4) || (memory > 0 && memory <= 4) || reduced) return 'weak';
  return 'none';
}

function isVerdict(value: unknown): value is GraphicsVerdict {
  if (typeof value !== 'object' || value === null) return false;
  const { tier, reason, at } = value as Record<string, unknown>;
  return (
    (tier === 'full' || tier === 'lite') &&
    (reason === 'hints' || reason === 'frames') &&
    typeof at === 'number'
  );
}

function readStored(): StoredGraphics {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (typeof parsed !== 'object' || parsed === null) return { choice: 'auto', verdict: null };
    const { choice, verdict } = parsed as Record<string, unknown>;
    return {
      choice: choice === 'full' || choice === 'lite' ? choice : 'auto',
      verdict: isVerdict(verdict) && Date.now() - verdict.at < VERDICT_TTL_MS ? verdict : null,
    };
  } catch {
    return { choice: 'auto', verdict: null };
  }
}

function writeStored(value: StoredGraphics): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Private mode / storage disabled: the choice lives for this visit only.
  }
}

/** Effective tier: an explicit choice wins; `auto` follows the verdict, `full` until there is one. */
function resolveTier(choice: GraphicsChoice, verdict: GraphicsVerdict | null): GraphicsTier {
  if (choice !== 'auto') return choice;
  return verdict?.tier ?? 'full';
}

interface GraphicsState extends StoredGraphics {
  tier: GraphicsTier;
  /** `auto` also forgets the remembered verdict, so the device is evaluated afresh. */
  setChoice: (choice: GraphicsChoice) => void;
  /** Records the automatic decision. Within a visit it only ever goes `full` → `lite`. */
  setVerdict: (verdict: GraphicsVerdict) => void;
}

/** A strong hardware hint decides without measuring; otherwise the probe will. */
const hintVerdict = (): GraphicsVerdict | null =>
  hardwareHint() === 'strong' ? { tier: 'lite', reason: 'hints', at: Date.now() } : null;

function initialState(): StoredGraphics {
  const stored = readStored();
  if (stored.verdict) return stored;
  const verdict = hintVerdict();
  if (verdict) writeStored({ ...stored, verdict });
  return { ...stored, verdict };
}

export const useGraphicsStore = create<GraphicsState>((set, get) => {
  const initial = initialState();
  const apply = (next: StoredGraphics) => {
    writeStored(next);
    set({ ...next, tier: resolveTier(next.choice, next.verdict) });
  };

  return {
    ...initial,
    tier: resolveTier(initial.choice, initial.verdict),
    setChoice: (choice) =>
      apply({ choice, verdict: choice === 'auto' ? hintVerdict() : get().verdict }),
    setVerdict: (verdict) => {
      const current = get().verdict;
      if (current?.tier === 'lite' && verdict.tier === 'full') return;
      apply({ choice: get().choice, verdict });
    },
  };
});

// `<html data-graphics="full|lite">` — the hook for CSS (`lite:` variant in index.css).
const applyToDocument = (tier: GraphicsTier) => {
  document.documentElement.dataset.graphics = tier;
};
applyToDocument(useGraphicsStore.getState().tier);
useGraphicsStore.subscribe((state, previous) => {
  if (state.tier !== previous.tier) applyToDocument(state.tier);
});

/** Current rendering tier — for components that render differently in `lite`. */
export function useGraphicsTier(): GraphicsTier {
  return useGraphicsStore((state) => state.tier);
}

/** `true` in the lite tier. */
export function useLiteGraphics(): boolean {
  return useGraphicsStore((state) => state.tier === 'lite');
}
