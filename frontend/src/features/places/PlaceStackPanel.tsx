import { useEffect, useMemo } from 'react';

import { useMapActions, useMapStack } from '@/features/map';
import type { PlaceCard } from '@/shared/api';
import { pluralize, PLURALS } from '@/shared/lib/format';
import { PanelLayout, Rise, StaggerItem } from '@/shared/ui';

import { PlaceListItem } from './PlaceListItem';

/** Events in the order they happen; everything else as the map lists it. */
function inOrder(places: readonly PlaceCard[]): readonly PlaceCard[] {
  if (!places.every((place) => place.event)) return places;
  return places.toSorted((a, b) =>
    (a.event?.starts_at ?? '').localeCompare(b.event?.starts_at ?? ''),
  );
}

/**
 * The list behind a count bubble that cannot be zoomed apart (`?stack=<lat>,<lng>`): places
 * that share one point on the map, e.g. the events of one venue. A tap opens the place card
 * on top; closing it returns here.
 */
export function PlaceStackPanel() {
  const { places, closeStack } = useMapStack();
  const { flyTo, ready } = useMapActions();
  const ordered = useMemo(() => inOrder(places), [places]);
  const first = ordered[0];
  const lat = first?.lat;
  const lng = first?.lng;

  useEffect(() => {
    if (ready && lat !== undefined && lng !== undefined) flyTo({ lat, lng });
  }, [ready, lat, lng, flyTo]);

  const onlyEvents = places.every((place) => place.event);
  return (
    <PanelLayout
      title={`Здесь ${pluralize(places.length, onlyEvents ? PLURALS.event : PLURALS.place)}`}
      subtitle={first?.address || 'В одной точке карты'}
      onBack={closeStack}
      backLabel="Закрыть"
    >
      <Rise>
        <ul className="flex flex-col gap-2">
          {ordered.map((place, index) => (
            <StaggerItem key={place.id} index={index}>
              <PlaceListItem place={place} />
            </StaggerItem>
          ))}
        </ul>
      </Rise>
    </PanelLayout>
  );
}
