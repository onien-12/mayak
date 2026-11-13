import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { Layer, MinStatus } from '@/shared/api';
import { LAYERS } from '@/shared/lib/labels';

export interface ExploreFilters {
  layers: Layer[];
  categoryIds: number[];
  minStatus: MinStatus;
  free: boolean;
  accessible: boolean;
  /** Attribute filters of the selected category: `key → value`. */
  attrs: Record<string, string>;
  includeResolved: boolean;
  includePast: boolean;
}

type FlagKey = 'free' | 'accessible' | 'includeResolved' | 'includePast';

interface ExploreState extends ExploreFilters {
  /** Search text — kept across navigation, not across reloads. */
  search: string;
  setSearch: (search: string) => void;
  toggleLayer: (layer: Layer) => void;
  toggleCategory: (id: number) => void;
  /** Drops selected categories that are not in the given list (after a layer is turned off). */
  retainCategories: (allowedIds: readonly number[]) => void;
  setMinStatus: (minStatus: MinStatus) => void;
  toggleFlag: (key: FlagKey) => void;
  setAttr: (key: string, value: string | null) => void;
  reset: () => void;
}

const DEFAULTS: ExploreFilters = {
  layers: [...LAYERS],
  categoryIds: [],
  minStatus: 'any',
  free: false,
  accessible: false,
  attrs: {},
  includeResolved: false,
  includePast: false,
};

const toggle = <T>(list: readonly T[], item: T): T[] =>
  list.includes(item) ? list.filter((value) => value !== item) : [...list, item];

/** Explore filters — persisted, so they survive navigation between sections and reloads. */
export const useExploreFilters = create<ExploreState>()(
  persist(
    (set, get) => ({
      ...DEFAULTS,
      search: '',
      setSearch: (search) => set({ search }),
      toggleLayer: (layer) => set({ layers: toggle(get().layers, layer) }),
      toggleCategory: (id) => set({ categoryIds: toggle(get().categoryIds, id), attrs: {} }),
      retainCategories: (allowedIds) => {
        const kept = get().categoryIds.filter((id) => allowedIds.includes(id));
        if (kept.length !== get().categoryIds.length) set({ categoryIds: kept, attrs: {} });
      },
      setMinStatus: (minStatus) => set({ minStatus }),
      toggleFlag: (key) => set({ [key]: !get()[key] }),
      setAttr: (key, value) => {
        const { [key]: _removed, ...rest } = get().attrs;
        set({ attrs: value === null ? rest : { ...rest, [key]: value } });
      },
      reset: () => set({ ...DEFAULTS, search: '' }),
    }),
    {
      name: 'mayak-explore',
      version: 1,
      partialize: ({ search: _search, ...state }) => state,
    },
  ),
);

export function countActiveFilters(filters: ExploreFilters): number {
  return (
    filters.categoryIds.length +
    Object.keys(filters.attrs).length +
    Number(filters.free) +
    Number(filters.accessible) +
    Number(filters.includeResolved) +
    Number(filters.includePast) +
    Number(filters.minStatus !== 'any') +
    (LAYERS.length - filters.layers.length)
  );
}
