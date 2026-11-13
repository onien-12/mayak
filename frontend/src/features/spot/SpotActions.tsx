import { LandPlot, MapPinPlus, MessageSquarePlus, type LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';

import { openCreateArea, useCanManageAreas } from '@/features/areas';
import { requireAuth } from '@/features/auth';
import type { MapTap } from '@/features/map';
import { openCreatePlace } from '@/features/places';
import { cn } from '@/shared/lib/cn';
import { TONES, type Tone } from '@/shared/lib/tones';
import { PRESS_SCALE, STAGGER_STEP, SPRING } from '@/shared/ui';

interface ActionTile {
  key: string;
  label: string;
  icon: LucideIcon;
  tone: Tone;
  onSelect: () => void;
}

interface SpotActionsProps {
  spot: MapTap;
  /** Address to prefill the create form with (object address or geocoded). */
  address: string | null;
  /** Name of the tapped object — the title of a new location. */
  objectName: string | null;
  onWriteNote: () => void;
}

/**
 * Big icon tiles: write a note, start the create flow prefilled with this point (a place, an
 * event or a problem — the first step of the flow asks which), or (level `trusted`+ /
 * moderators) turn the tapped object into a location. The spot stays open under the flow, so
 * «назад» returns here.
 */
export function SpotActions({ spot, address, objectName, onWriteNote }: SpotActionsProps) {
  const canCreateArea = useCanManageAreas();

  const tiles: ActionTile[] = [
    {
      key: 'note',
      label: 'Заметка',
      icon: MessageSquarePlus,
      tone: 'brand',
      onSelect: onWriteNote,
    },
    {
      key: 'place',
      label: 'Добавить место',
      icon: MapPinPlus,
      tone: 'infrastructure',
      onSelect: () =>
        requireAuth(
          () =>
            openCreatePlace({
              point: { lat: spot.lat, lng: spot.lng },
              address: address ?? undefined,
            }),
          'чтобы добавить место на карту',
        ),
    },
  ];
  if (canCreateArea) {
    tiles.push({
      key: 'area',
      label: 'Создать локацию',
      icon: LandPlot,
      tone: 'beam',
      onSelect: () =>
        requireAuth(
          () =>
            openCreateArea({
              point: { lat: spot.lat, lng: spot.lng },
              title: objectName ?? undefined,
              objectId: spot.objectId,
            }),
          'чтобы создать локацию',
        ),
    });
  }

  return (
    <div data-sheet-ignore className="flex gap-2">
      {tiles.map((tile, index) => {
        const Icon = tile.icon;
        return (
          <motion.button
            key={tile.key}
            type="button"
            onClick={tile.onSelect}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            whileTap={{ scale: PRESS_SCALE }}
            transition={{ ...SPRING.sheet, delay: index * STAGGER_STEP }}
            className="flex min-h-[92px] min-w-0 flex-1 flex-col items-center gap-2 rounded-card border border-line/70 bg-surface px-1 pt-3 pb-2.5 text-center transition-[border-color,box-shadow] hover:border-ink-faint/50 hover:shadow-card"
          >
            <span
              className={cn(
                'flex size-11 items-center justify-center rounded-full',
                TONES[tile.tone].soft,
              )}
            >
              <Icon size={21} aria-hidden strokeWidth={2.1} />
            </span>
            <span className="text-xs leading-tight font-medium text-ink">{tile.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
