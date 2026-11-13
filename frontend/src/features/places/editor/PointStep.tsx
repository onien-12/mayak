import { LocateFixed, MapPinned, Search } from 'lucide-react';
import { useEffect, useState } from 'react';

import { usePickPoint, useUserLocation } from '@/features/map';
import { useAddressSuggest, useIsDesktop } from '@/shared/hooks';
import { formatCoords, VLADIVOSTOK_CENTER, type LatLng } from '@/shared/lib/geo';
import { Button, Input, PanelLayout, usePanelStore, useSheetPeek } from '@/shared/ui';

import type { StepFrame } from './StepFrame';

/** Phone: sheet height that keeps the hint and the confirm button visible over the map. */
const PICK_PEEK_PX = 300;

interface PointStepProps {
  frame: StepFrame;
  initial: LatLng | undefined;
  onConfirm: (point: LatLng, address: string | undefined) => void;
}

/**
 * Step 3: where is it? The pin is fixed in the centre of the visible map — the user moves
 * the map under it, taps the map, jumps to their location or searches for an address.
 */
export function PointStep({ frame, initial, onConfirm }: PointStepProps) {
  const isDesktop = useIsDesktop();
  const showMap = usePanelStore((state) => state.showMap);
  const { point, moveTo } = usePickPoint(true, initial);
  const { locate, status } = useUserLocation();
  const [query, setQuery] = useState('');
  const [address, setAddress] = useState<string>();
  const { suggestions } = useAddressSuggest(query, point ?? VLADIVOSTOK_CENTER);

  useSheetPeek(isDesktop ? null : PICK_PEEK_PX);
  useEffect(() => showMap(), [showMap]);

  const toMyLocation = async () => {
    const found = await locate({ fly: false });
    if (found) moveTo(found);
  };

  return (
    <PanelLayout
      {...frame}
      footer={
        <Button
          block
          size="lg"
          icon={MapPinned}
          disabled={!point}
          onClick={() => point && onConfirm(point, address)}
        >
          Точка здесь
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-ink-soft">
          Двигайте карту, чтобы булавка встала на нужное место, или нажмите на карту.
          {point && (
            <span className="mt-0.5 block text-xs text-ink-faint tabular-nums">
              {formatCoords(point)}
            </span>
          )}
        </p>
        <Button
          variant="secondary"
          icon={LocateFixed}
          loading={status === 'locating'}
          onClick={() => void toMyLocation()}
        >
          Моё местоположение
        </Button>
        <div>
          <Input
            icon={Search}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Или найдите адрес"
            aria-label="Поиск адреса"
          />
          {suggestions.length > 0 && (
            <ul className="mt-1.5 overflow-hidden rounded-control border border-line bg-surface">
              {suggestions.slice(0, 5).map((suggestion) => (
                <li key={suggestion.id}>
                  <button
                    type="button"
                    onClick={() => {
                      moveTo(suggestion.point);
                      setAddress(
                        suggestion.subtitle
                          ? `${suggestion.title}, ${suggestion.subtitle}`
                          : suggestion.title,
                      );
                      setQuery('');
                      showMap();
                    }}
                    className="flex min-h-12 w-full flex-col justify-center px-3 py-1.5 text-left hover:bg-canvas"
                  >
                    <span className="truncate text-sm font-medium text-ink">
                      {suggestion.title}
                    </span>
                    {suggestion.subtitle && (
                      <span className="truncate text-xs text-ink-faint">{suggestion.subtitle}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </PanelLayout>
  );
}
