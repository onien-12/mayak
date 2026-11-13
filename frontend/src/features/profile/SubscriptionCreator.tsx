import { useId, useState } from 'react';

import { useUserLocation } from '@/features/map';
import type { Layer } from '@/shared/api';
import { formatDistance } from '@/shared/lib/format';
import { LAYER_META, LAYERS } from '@/shared/lib/labels';
import { Chip, Input } from '@/shared/ui';

import { MapPicker } from './MapPicker';
import { useCreateSubscription } from './useProfile';

/** Radius steps of the slider, metres (API: 200..10 000). */
const RADII = [200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000, 7500, 10000] as const;
const DEFAULT_RADIUS_INDEX = 4;
const TITLE_MAX = 80;

const toggle = (list: readonly Layer[], layer: Layer): Layer[] =>
  list.includes(layer) ? list.filter((item) => item !== layer) : [...list, layer];

interface SubscriptionCreatorProps {
  open: boolean;
  onClose: () => void;
}

/** New territory subscription: centre on the map, radius with a live circle, layers, title. */
export function SubscriptionCreator({ open, onClose }: SubscriptionCreatorProps) {
  const { location } = useUserLocation();
  const create = useCreateSubscription();
  const [radiusIndex, setRadiusIndex] = useState(DEFAULT_RADIUS_INDEX);
  const [layers, setLayers] = useState<Layer[]>([...LAYERS]);
  const [title, setTitle] = useState('');
  const sliderId = useId();
  const radius = RADII[radiusIndex] ?? RADII[DEFAULT_RADIUS_INDEX];

  const close = () => {
    setTitle('');
    onClose();
  };

  return (
    <MapPicker
      open={open}
      title="Новая подписка на район"
      initial={location?.point ?? null}
      radiusM={radius}
      confirmLabel="Подписаться"
      confirmDisabled={layers.length === 0 || title.trim().length === 0}
      loading={create.isPending}
      onCancel={close}
      onConfirm={(point) =>
        create.mutate(
          { title: title.trim(), lat: point.lat, lng: point.lng, radius_m: radius, layers },
          { onSuccess: close },
        )
      }
    >
      <Input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        maxLength={TITLE_MAX}
        placeholder="Название, например «У работы»"
        aria-label="Название подписки"
      />
      <div>
        <label htmlFor={sliderId} className="flex justify-between text-sm text-ink-soft">
          Радиус
          <span className="font-semibold text-ink tabular-nums">{formatDistance(radius)}</span>
        </label>
        <input
          id={sliderId}
          type="range"
          min={0}
          max={RADII.length - 1}
          step={1}
          value={radiusIndex}
          aria-valuetext={formatDistance(radius)}
          onChange={(event) => setRadiusIndex(Number(event.target.value))}
          className="h-11 w-full cursor-pointer accent-brand"
        />
      </div>
      <div className="-mx-4 no-scrollbar flex gap-2 overflow-x-auto px-4" aria-label="Слои">
        {LAYERS.map((layer) => (
          <Chip
            key={layer}
            tone={LAYER_META[layer].tone}
            icon={LAYER_META[layer].icon}
            selected={layers.includes(layer)}
            onClick={() => setLayers((list) => toggle(list, layer))}
          >
            {LAYER_META[layer].short}
          </Chip>
        ))}
      </div>
    </MapPicker>
  );
}
