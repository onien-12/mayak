import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

/** «Все» (outages summary + residents' problems), «От жителей», «Отключения». */
export type ProblemsMode = 'all' | 'residents' | 'outages';

export const PROBLEMS_MODE_PARAM = 'show';
const MODES: readonly ProblemsMode[] = ['all', 'residents', 'outages'];

const isMode = (value: string | null): value is ProblemsMode =>
  MODES.some((mode) => mode === value);

/** The switch of «Проблемы» in the URL (`?show=outages`); «Все» is the default and has no parameter. */
export function useProblemsMode() {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get(PROBLEMS_MODE_PARAM);
  const mode: ProblemsMode = isMode(raw) ? raw : 'all';

  const setMode = useCallback(
    (next: ProblemsMode) =>
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (next === 'all') params.delete(PROBLEMS_MODE_PARAM);
          else params.set(PROBLEMS_MODE_PARAM, next);
          // The resource filter (`?resource=`) belongs to «Отключения» only.
          if (next !== 'outages') params.delete('resource');
          return params;
        },
        { replace: true },
      ),
    [setSearchParams],
  );

  return { mode, setMode };
}
