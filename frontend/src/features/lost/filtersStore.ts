import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { LostCategory, LostKind, LostQuery } from '@/shared/api';

import { daysAgoValue } from './lostMeta';

export type LostPeriod = 'all' | 3 | 7;

export const PERIOD_OPTIONS: readonly { value: LostPeriod; label: string }[] = [
  { value: 'all', label: 'За месяц' },
  { value: 3, label: '3 дня' },
  { value: 7, label: 'Неделя' },
];

interface LostFilters {
  kind: LostKind | 'all';
  categories: LostCategory[];
  period: LostPeriod;
}

interface LostFiltersState extends LostFilters {
  setKind: (kind: LostKind | 'all') => void;
  toggleCategory: (category: LostCategory) => void;
  setPeriod: (period: LostPeriod) => void;
  reset: () => void;
}

const DEFAULTS: LostFilters = { kind: 'all', categories: [], period: 'all' };

/** Filters of «Потеряшки» — shared by the list, the map pins and a post's page. */
export const useLostFilters = create<LostFiltersState>()(
  persist(
    (set, get) => ({
      ...DEFAULTS,
      setKind: (kind) => set({ kind }),
      toggleCategory: (category) => {
        const current = get().categories;
        set({
          categories: current.includes(category)
            ? current.filter((item) => item !== category)
            : [...current, category],
        });
      },
      setPeriod: (period) => set({ period }),
      reset: () => set(DEFAULTS),
    }),
    { name: 'mayak-lost-filters', version: 1 },
  ),
);

export function countActiveFilters(filters: LostFilters): number {
  return (
    (filters.kind !== 'all' ? 1 : 0) +
    (filters.categories.length > 0 ? 1 : 0) +
    (filters.period !== 'all' ? 1 : 0)
  );
}

/** The list query; day-aligned, so the key stays the same for the whole day. */
export function toLostQuery(filters: LostFilters): LostQuery {
  return {
    kind: filters.kind === 'all' ? undefined : filters.kind,
    category: filters.categories.length > 0 ? [...filters.categories].sort().join(',') : undefined,
    since: filters.period === 'all' ? undefined : daysAgoValue(filters.period),
  };
}
