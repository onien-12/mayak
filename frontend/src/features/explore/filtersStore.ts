import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { Layer, MinStatus } from '@/shared/api';

/**
 * What the «Карта» section draws and lists: places only. Events live in «События», problems
 * and outages in «Проблемы»; an event or a problem opened by a link is still drawn as the
 * selected place.
 */
export const MAP_LAYERS: readonly Layer[] = ['infrastructure', 'tourism'];

export interface ExploreFilters {
  layers: Layer[];
  categoryIds: number[];
  minStatus: MinStatus;
  free: boolean;
  accessible: boolean;
  /** Attribute filters of the selected category: `key → value`. */
  attrs: Record<string, string>;
  /** Draw the bare OpenStreetMap background objects (yard playgrounds, lone monuments) too. */
  includeUnnamed: boolean;
}

type FlagKey = 'free' | 'accessible' | 'includeUnnamed';

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
  layers: [...MAP_LAYERS],
  categoryIds: [],
  minStatus: 'any',
  free: false,
  accessible: false,
  attrs: {},
  includeUnnamed: false,
};

/**
 * v1 listed events and problems too: keep the place layers that were on (all of them when none
 * was) and drop the event and problem toggles; their categories go once the chips load.
 */
function migrateFilters(persisted: unknown, version: number): Partial<ExploreFilters> {
  const stored = (persisted ?? {}) as Partial<ExploreFilters> & Record<string, unknown>;
  if (version >= 2) return stored;
  const { includePast: _past, includeResolved: _resolved, ...rest } = stored;
  const layers = (stored.layers ?? []).filter((layer) => MAP_LAYERS.includes(layer));
  return { ...rest, layers: layers.length > 0 ? layers : [...MAP_LAYERS] };
}

const toggle = <T>(list: readonly T[], item: T): T[] =>
  list.includes(item) ? list.filter((value) => value !== item) : [...list, item];

/** Explore filters — persisted, so they survive navigation between sections and reloads. */
export const useExploreFilters = create<ExploreState>()(
  persist(
    (set, get) => ({
      ...DEFAULTS,
      search: '',
      setSearch: (search) => set({ search }),
      toggleLayer: (layer) => {
        if (MAP_LAYERS.includes(layer)) set({ layers: toggle(get().layers, layer) });
      },
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
      version: 2,
      partialize: ({ search: _search, ...state }) => state,
      migrate: (persisted, version) =>
        migrateFilters(persisted, version) as Omit<ExploreState, 'search'>,
    },
  ),
);

export function countActiveFilters(filters: ExploreFilters): number {
  return (
    filters.categoryIds.length +
    Object.keys(filters.attrs).length +
    Number(filters.free) +
    Number(filters.accessible) +
    Number(filters.includeUnnamed) +
    Number(filters.minStatus !== 'any') +
    (MAP_LAYERS.length - filters.layers.length)
  );
}
