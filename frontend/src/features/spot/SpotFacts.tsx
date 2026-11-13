import { Check, ChevronRight, Copy, MapPin, Navigation } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';

import { usePlaceParam, useUserLocation, type MapTap } from '@/features/map';
import type { OutageBuildingPoint } from '@/shared/api';
import { formatDistance } from '@/shared/lib/format';
import { formatCoords, haversine } from '@/shared/lib/geo';
import { OUTAGE_RESOURCE_META } from '@/shared/lib/labels';
import { Pop, Skeleton, SPRING, toast } from '@/shared/ui';

import type { SpotInfo } from './useSpotInfo';

const COPIED_MS = 1800;

function CopyCoords({ spot }: { spot: MapTap }) {
  const [copied, setCopied] = useState(false);
  const text = formatCoords(spot);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), COPIED_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Координаты скопированы');
    } catch {
      toast.error('Не получилось скопировать — выделите координаты вручную');
    }
  };

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={`Скопировать координаты ${text}`}
      className="tap-target relative inline-flex h-9 items-center gap-1.5 rounded-full bg-canvas px-3 text-xs font-medium text-ink-soft tabular-nums transition-transform active:scale-[0.97]"
    >
      <Pop trigger={copied}>
        {copied ? (
          <Check size={14} aria-hidden className="text-success" />
        ) : (
          <Copy size={14} aria-hidden />
        )}
      </Pop>
      {text}
    </button>
  );
}

function outageText(house: OutageBuildingPoint): string {
  const missing = house.resources.map((resource) =>
    OUTAGE_RESOURCE_META[resource].missing.toLowerCase(),
  );
  return `По этому адресу сейчас ${missing.join(' и ')}`;
}

function OutageNotice({ house }: { house: OutageBuildingPoint }) {
  const { openPlace } = usePlaceParam();
  const [first] = house.resources;
  const [placeId] = house.place_ids;
  if (!first || placeId === undefined) return null;
  const Icon = OUTAGE_RESOURCE_META[first].icon;

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING.sheet}
      onClick={() => openPlace(placeId)}
      className="flex w-full items-center gap-3 rounded-card bg-issue-soft p-3 text-left transition-transform active:scale-[0.98]"
    >
      <span className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-issue text-white">
        <span aria-hidden className="absolute inset-0 animate-pulse-ring rounded-full bg-issue" />
        <Icon size={18} aria-hidden className="relative" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-issue-ink">{outageText(house)}</span>
        <span className="block truncate text-xs text-ink-soft">{house.address} · данные VL.ru</span>
      </span>
      <ChevronRight size={18} aria-hidden className="shrink-0 text-issue-ink/70" />
    </motion.button>
  );
}

interface SpotFactsProps {
  spot: MapTap;
  info: SpotInfo;
  outage: OutageBuildingPoint | null;
}

/** Address, distance from the user, copyable coordinates and the outage hint of the spot. */
export function SpotFacts({ spot, info, outage }: SpotFactsProps) {
  const { location } = useUserLocation();
  const distance = location ? haversine(location.point, spot) : null;

  return (
    <div className="flex flex-col gap-3">
      {info.isResolving ? (
        <Skeleton className="h-4 w-3/5" />
      ) : (
        info.address && (
          <p className="flex items-start gap-1.5 text-sm text-ink-soft">
            <MapPin size={15} aria-hidden className="mt-0.5 shrink-0 text-ink-faint" />
            {info.address}
          </p>
        )
      )}
      {!info.isResolving && !info.title && (
        <p className="text-sm text-ink-soft">
          Адрес не определился — заметки и места привяжутся к координатам.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {distance !== null && (
          <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-brand-soft px-3 text-xs font-medium text-brand">
            <Navigation size={13} aria-hidden />
            {formatDistance(distance)} от вас
          </span>
        )}
        <CopyCoords spot={spot} />
      </div>
      {outage && <OutageNotice house={outage} />}
    </div>
  );
}
