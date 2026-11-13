import type { ExternalSourceId, PlaceCard } from '../api/types';

/** Sources whose import counts as one first confirmation only: an open map, a travel guide. */
const BASELINE_SOURCES: ReadonlySet<ExternalSourceId> = new Set(['osm', 'wikivoyage']);

/**
 * Imported from a map or a guide and not yet confirmed by any resident: the source's own baseline
 * must not be presented as a confirmation (SPEC §18, §21).
 */
export function isUnconfirmedImport(
  place: Pick<PlaceCard, 'external' | 'last_confirmed_at'>,
): boolean {
  return (
    place.external !== null &&
    BASELINE_SOURCES.has(place.external.source) &&
    place.last_confirmed_at === null
  );
}
