import { Navigation } from 'lucide-react';

import { useMapActions, useMapViewport } from '@/features/map';
import type { AddressSuggestion } from '@/shared/api';
import { useAddressSuggest } from '@/shared/hooks';
import { VLADIVOSTOK_CENTER } from '@/shared/lib/geo';
import { usePanelStore } from '@/shared/ui';

const MAX_SUGGESTIONS = 4;

/** 2GIS address suggestions for the search text; picking one flies the map there. */
export function AddressResults({ search }: { search: string }) {
  const viewport = useMapViewport();
  const { flyTo } = useMapActions();
  const showMap = usePanelStore((state) => state.showMap);
  const { suggestions } = useAddressSuggest(search, viewport?.center ?? VLADIVOSTOK_CENTER);

  if (suggestions.length === 0) return null;

  const pick = (suggestion: AddressSuggestion) => {
    flyTo(suggestion.point, { minZoom: 16 });
    showMap();
  };

  return (
    <section aria-label="Адреса">
      <h2 className="mb-1 text-xs font-medium text-ink-faint">Адреса и объекты 2ГИС</h2>
      <ul>
        {suggestions.slice(0, MAX_SUGGESTIONS).map((suggestion) => (
          <li key={suggestion.id}>
            <button
              type="button"
              onClick={() => pick(suggestion)}
              className="-mx-2 flex w-[calc(100%+16px)] items-center gap-3 rounded-control px-2 py-2 text-left transition-colors hover:bg-canvas"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
                <Navigation size={16} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink">
                  {suggestion.title}
                </span>
                {suggestion.subtitle && (
                  <span className="block truncate text-xs text-ink-faint">
                    {suggestion.subtitle}
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
