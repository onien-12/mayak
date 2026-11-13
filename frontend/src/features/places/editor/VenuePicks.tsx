import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';

import { placesApi, queryKeys, type PlaceCard } from '@/shared/api';
import { useCategories } from '@/shared/hooks';
import { FORMAT_SLUGS } from '@/shared/lib/eventFormats';
import { formatDistance } from '@/shared/lib/format';
import { boundsToBbox, haversine, type LatLng } from '@/shared/lib/geo';
import { CategoryIcon } from '@/shared/ui';

/** How far around the pin venues are offered (≈ 5 km), and how many of the nearest. */
const SPAN_LAT = 0.045;
const SPAN_LNG = 0.06;
const SHOWN = 4;
/** The query follows the pin in steps of about a kilometre, not with every drag. */
const STEP = 0.01;

const snap = (value: number) => Math.round(value / STEP) * STEP;

interface VenuePicksProps {
  around: LatLng;
  onPick: (venue: PlaceCard) => void;
}

/** «Площадки рядом»: venues residents offer for meetups, nearest to the pin first (SPEC §3.4). */
export function VenuePicks({ around, onPick }: VenuePicksProps) {
  const { categories } = useCategories();
  const venueCategory = categories.find((category) => category.slug === FORMAT_SLUGS.venue);
  const lat = snap(around.lat);
  const lng = snap(around.lng);
  const request = {
    bbox: boundsToBbox({
      minLat: lat - SPAN_LAT,
      minLng: lng - SPAN_LNG,
      maxLat: lat + SPAN_LAT,
      maxLng: lng + SPAN_LNG,
    }),
    categories: venueCategory ? [venueCategory.id] : [],
    limit: 50,
  };
  const { data } = useQuery({
    queryKey: queryKeys.places.list(request),
    queryFn: ({ signal }) => placesApi.list(request, signal),
    enabled: venueCategory !== undefined,
  });
  const nearest = (data ?? [])
    .map((venue) => ({ venue, distance: haversine(around, venue) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, SHOWN);
  if (!venueCategory || nearest.length === 0) return null;

  return (
    <section aria-labelledby="venue-picks" className="flex flex-col gap-1.5">
      <h3 id="venue-picks" className="text-sm font-semibold text-ink">
        Площадки рядом
        <span className="ml-1.5 font-normal text-ink-faint">— их предлагают жители</span>
      </h3>
      <ul className="overflow-hidden rounded-control border border-line bg-surface">
        {nearest.map(({ venue, distance }) => (
          <li key={venue.id} className="border-line not-first:border-t">
            <button
              type="button"
              onClick={() => onPick(venue)}
              className="flex min-h-13 w-full items-center gap-2.5 px-2.5 py-1.5 text-left hover:bg-canvas"
            >
              <CategoryIcon slug={FORMAT_SLUGS.venue} layer="infrastructure" size={32} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-ink">{venue.title}</span>
                <span className="truncate text-xs text-ink-faint">
                  {[formatDistance(distance), venue.address].filter(Boolean).join(' · ')}
                </span>
              </span>
              <ChevronRight size={16} aria-hidden className="shrink-0 text-ink-faint" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
