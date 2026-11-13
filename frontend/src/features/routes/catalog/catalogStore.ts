import { create } from 'zustand';

import type { RouteDifficulty, RouteKind, RoutesSort } from '@/shared/api';

export type CatalogScope = 'all' | 'mine';

interface CatalogState {
  scope: CatalogScope;
  kinds: RouteKind[];
  difficulties: RouteDifficulty[];
  search: string;
  sort: RoutesSort;
  setScope: (scope: CatalogScope) => void;
  toggleKind: (kind: RouteKind) => void;
  toggleDifficulty: (difficulty: RouteDifficulty) => void;
  setSearch: (search: string) => void;
  setSort: (sort: RoutesSort) => void;
  reset: () => void;
}

const toggle = <T>(list: readonly T[], item: T): T[] =>
  list.includes(item) ? list.filter((value) => value !== item) : [...list, item];

const INITIAL = {
  kinds: [] as RouteKind[],
  difficulties: [] as RouteDifficulty[],
  search: '',
  sort: 'new' as RoutesSort,
};

/** Catalog filters — kept while the user opens a route and comes back. */
export const useCatalogFilters = create<CatalogState>((set) => ({
  scope: 'all',
  ...INITIAL,
  setScope: (scope) => set({ scope }),
  toggleKind: (kind) => set((state) => ({ kinds: toggle(state.kinds, kind) })),
  toggleDifficulty: (difficulty) =>
    set((state) => ({ difficulties: toggle(state.difficulties, difficulty) })),
  setSearch: (search) => set({ search }),
  setSort: (sort) => set({ sort }),
  reset: () => set(INITIAL),
}));

export function countCatalogFilters(
  state: Pick<CatalogState, 'kinds' | 'difficulties' | 'search'>,
) {
  return state.kinds.length + state.difficulties.length + (state.search.trim() ? 1 : 0);
}
