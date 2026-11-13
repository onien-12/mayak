import type { QueryClient } from '@tanstack/react-query';

import { queryKeys, type AreaDetail, type AreaRef, type PlaceDetail } from '@/shared/api';
import type { LatLng } from '@/shared/lib/geo';

/** `auto` → the server assigns the area by position (`area_id` omitted). */
export type AreaChoice = { kind: 'auto' } | { kind: 'area'; area: AreaRef } | { kind: 'none' };

/** `area_id` for the API: omitted, an id or explicitly none. */
export function areaIdOf(choice: AreaChoice): number | null | undefined {
  if (choice.kind === 'auto') return undefined;
  return choice.kind === 'area' ? choice.area.id : null;
}

/**
 * Editing keeps the place's area unless its point moved (then the server decides again);
 * «Добавить место сюда» preselects the area whose card is open (its detail is cached).
 */
export function initialAreaChoice(
  point: LatLng,
  editing: PlaceDetail | undefined,
  presetAreaId: number | undefined,
  queryClient: QueryClient,
): AreaChoice {
  if (editing) {
    if (editing.lat !== point.lat || editing.lng !== point.lng) return { kind: 'auto' };
    return editing.area ? { kind: 'area', area: editing.area } : { kind: 'none' };
  }
  const preset =
    presetAreaId === undefined
      ? undefined
      : queryClient.getQueryData<AreaDetail>(queryKeys.areas.detail(presetAreaId));
  return preset ? { kind: 'area', area: { id: preset.id, title: preset.title } } : { kind: 'auto' };
}
