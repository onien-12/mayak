import { create } from 'zustand';

import type { IssueStage } from '@/shared/api';

interface ProblemFiltersState {
  categoryIds: number[];
  /** Empty = every stage, solved ones included (they sink to the end of the list). */
  stages: IssueStage[];
  toggleCategory: (id: number) => void;
  toggleStage: (stage: IssueStage) => void;
  reset: () => void;
}

const toggle = <T>(items: readonly T[], item: T): T[] =>
  items.includes(item) ? items.filter((value) => value !== item) : [...items, item];

/** Filters of residents' problems — kept across navigation, not across reloads. */
export const useProblemFilters = create<ProblemFiltersState>()((set) => ({
  categoryIds: [],
  stages: [],
  toggleCategory: (id) => set((state) => ({ categoryIds: toggle(state.categoryIds, id) })),
  toggleStage: (stage) => set((state) => ({ stages: toggle(state.stages, stage) })),
  reset: () => set({ categoryIds: [], stages: [] }),
}));

export function countProblemFilters(state: Pick<ProblemFiltersState, 'categoryIds' | 'stages'>) {
  return state.categoryIds.length + state.stages.length;
}
