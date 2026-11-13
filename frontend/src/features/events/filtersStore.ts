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
  origin: 'all',
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
      toggleFree: () => set({ free: !get().free }),
      togglePast: () => set({ past: !get().past }),
      setRadius: (radiusKm) => set({ radiusKm }),
      setSort: (sort) => set({ sort }),
      reset: () => set({ ...DEFAULTS, search: '' }),
    }),
    {
      name: 'mayak-events',
      version: 1,
      partialize: ({ search: _search, ...state }) => state,
    },
  ),
);

/** Filters that differ from the defaults (the period is shown separately, as chips). */
export function countActiveFilters(filters: EventsFilters): number {
  return (
    filters.categoryIds.length +
    Number(filters.kind !== 'all') +
    Number(filters.origin !== 'all') +
    Number(filters.free) +
    Number(filters.past) +
    Number(filters.radiusKm !== null) +
    Number(filters.sort !== 'start')
  );
}
