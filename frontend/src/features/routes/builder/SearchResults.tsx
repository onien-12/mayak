import { MapPin } from 'lucide-react';
import type { ReactNode } from 'react';

import { useMapActions, useMapViewport } from '@/features/map';
import { useAddressSuggest, useCategories } from '@/shared/hooks';
import { VLADIVOSTOK_CENTER } from '@/shared/lib/geo';
import { CategoryIcon, Spinner, toast } from '@/shared/ui';

import { addPlaceStop, FULL_ROUTE_MESSAGE } from './actions';
import { useBuilderStore } from './store';
import { usePlaceSearch } from './usePlaceCandidates';

const ADDRESS_LIMIT = 4;

interface SearchResultsProps {
  query: string;
  onPicked: () => void;
}

function ResultButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex min-h-12 w-full items-center gap-3 rounded-control px-2 py-1.5 text-left hover:bg-canvas active:bg-canvas"
      >
        {children}
      </button>
    </li>
  );
}

/** Places (linked stops) and 2GIS addresses (custom stops) matching the search. */
export function SearchResults({ query, onPicked }: SearchResultsProps) {
  const { byId } = useCategories();
  const { flyTo } = useMapActions();
  const viewport = useMapViewport();
  const places = usePlaceSearch(query);
  const { suggestions, isFetching } = useAddressSuggest(
    query,
    viewport?.center ?? VLADIVOSTOK_CENTER,
  );
  const addresses = suggestions.slice(0, ADDRESS_LIMIT);
  const empty =
    !places.isFetching && !isFetching && (places.data ?? []).length === 0 && addresses.length === 0;

  const pickAddress = (title: string, point: { lat: number; lng: number }) => {
    if (useBuilderStore.getState().addStop(point, { title }) === null) {
      toast.info(FULL_ROUTE_MESSAGE);
    }
    flyTo(point, { minZoom: 15 });
    onPicked();
  };

  return (
    <div className="flex flex-col gap-1 rounded-card border border-line p-1.5">
      {(places.isFetching || isFetching) && (
        <p className="flex items-center gap-2 px-2 py-2 text-sm text-ink-soft">
          <Spinner size={14} /> Ищем…
        </p>
      )}
      {empty && query.trim().length >= 2 && (
        <p className="px-2 py-2 text-sm text-ink-soft">
          Ничего не нашлось — поставьте точку на карте вручную.
        </p>
      )}
      <ul className="flex flex-col">
        {places.data?.map((place) => (
          <ResultButton
            key={`place-${place.id}`}
            onClick={() => {
              addPlaceStop(place);
              flyTo(place, { minZoom: 15 });
              onPicked();
            }}
          >
            <CategoryIcon slug={byId.get(place.category_id)?.slug} layer={place.layer} size={32} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink">{place.title}</span>
              <span className="block truncate text-xs text-ink-faint">
                {byId.get(place.category_id)?.name ?? 'Место на карте'}
                {place.address ? ` · ${place.address}` : ''}
              </span>
            </span>
          </ResultButton>
        ))}
        {addresses.map((item) => (
          <ResultButton
            key={`address-${item.id}`}
            onClick={() => pickAddress(item.title, item.point)}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-canvas text-ink-soft">
              <MapPin size={16} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink">{item.title}</span>
              {item.subtitle && (
                <span className="block truncate text-xs text-ink-faint">{item.subtitle}</span>
              )}
            </span>
          </ResultButton>
        ))}
      </ul>
    </div>
  );
}
