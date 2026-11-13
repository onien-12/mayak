import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { ContentOrigin, EventsSort } from '@/shared/api';

/** Preset periods of the afisha; `custom` uses `range`. */
export type TimePreset = 'any' | 'today' | 'tomorrow' | 'weekend' | 'week' | 'month' | 'custom';
/** `city` = everything except meetups. */
export type EventKind = 'all' | 'city' | 'meetups';
export type EventOrigin = 'all' | ContentOrigin;

/** Custom period, inclusive local days `YYYY-MM-DD`. */
export interface DayRange {
  from: string;
  to: string;
}

export interface EventsFilters {
  time: TimePreset;
  range: DayRange | null;
  categoryIds: number[];
  kind: EventKind;
  origin: EventOrigin;
  free: boolean;
  past: boolean;
  /** Only events this close to the user (or the map centre); `null` = the whole city. */
  radiusKm: number | null;
  sort: EventsSort;
}

interface EventsFiltersState extends EventsFilters {
  /** Search text — kept across navigation, not across reloads. */
  search: string;
  setSearch: (search: string) => void;
  setTime: (time: Exclude<TimePreset, 'custom'>) => void;
  setRange: (range: DayRange) => void;
  toggleCategory: (id: number) => void;
  setKind: (kind: EventKind) => void;
  setOrigin: (origin: EventOrigin) => void;
  toggleFree: () => void;
  togglePast: () => void;
  setRadius: (radiusKm: number | null) => void;
  setSort: (sort: EventsSort) => void;
  reset: () => void;
}

const DEFAULTS: EventsFilters = {
  time: 'any',
  range: null,
  categoryIds: [],
  kind: 'all',
  // What residents arrange themselves is the point of the section; city listings are a filter away.
  origin: 'community',
  free: false,
  past: false,
  radiusKm: null,
  sort: 'start',
};

/** Afisha filters — persisted, so they survive navigation between sections and reloads. */
export const useEventsFilters = create<EventsFiltersState>()(
  persist(
    (set, get) => ({
      ...DEFAULTS,
      search: '',
      setSearch: (search) => set({ search }),
      setTime: (time) => set({ time, range: null }),
      setRange: (range) => set({ time: 'custom', range }),
      toggleCategory: (id) => {
        const ids = get().categoryIds;
        set({ categoryIds: ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id] });
      },
      setKind: (kind) => set({ kind }),
      setOrigin: (origin) => set({ origin }),
      // Among free events there is nothing to order by price.
      toggleFree: () => {
        const free = !get().free;
        set({ free, ...(free && get().sort === 'price' && { sort: 'start' }) });
      },
      togglePast: () => set({ past: !get().past }),
      setRadius: (radiusKm) => set({ radiusKm }),
      setSort: (sort) => set({ sort }),
      reset: () => set({ ...DEFAULTS, search: '' }),
    }),
    {
      name: 'mayak-events',
      version: 2,
      // v1 remembered «все» as the default source; the section now opens on residents' events.
      migrate: (stored, version) =>
        version < 2 ? { ...(stored as EventsFilters), origin: DEFAULTS.origin } : stored,
      partialize: ({ search: _search, ...state }) => state,
    },
  ),
);

/** Filters that differ from the defaults (the period is shown separately, as chips). */
export function countActiveFilters(filters: EventsFilters): number {
  return (
    filters.categoryIds.length +
    Number(filters.kind !== 'all') +
    Number(filters.origin !== DEFAULTS.origin) +
    Number(filters.free) +
    Number(filters.past) +
    Number(filters.radiusKm !== null) +
    Number(filters.sort !== 'start')
  );
}
