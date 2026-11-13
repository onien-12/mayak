import { LocateFixed, Minus, Plus } from 'lucide-react';

import { cn } from '@/shared/lib/cn';
import { IconButton, Spinner } from '@/shared/ui';

import { useUserLocation } from './geolocation';
import { useMapActions } from './hooks';

interface MapControlsProps {
  /** Zoom buttons are redundant on touch screens (pinch). */
  zoom?: boolean;
  className?: string;
}

/** Floating zoom and «где я» buttons in the app style (replaces the stock 2GIS control). */
export function MapControls({ zoom = true, className }: MapControlsProps) {
  const { zoomBy, ready } = useMapActions();
  const { location, status, locate } = useUserLocation();

  if (!ready) return null;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {zoom && (
        <div className="flex flex-col overflow-hidden rounded-control border border-line/70 shadow-card glass">
          <IconButton
            icon={Plus}
            label="Приблизить"
            size="lg"
            className="rounded-none"
            onClick={() => zoomBy(1)}
          />
          <span aria-hidden className="mx-2 h-px bg-line" />
          <IconButton
            icon={Minus}
            label="Отдалить"
            size="lg"
            className="rounded-none"
            onClick={() => zoomBy(-1)}
          />
        </div>
      )}
      <div className="relative">
        <IconButton
          icon={LocateFixed}
          label="Где я"
          size="lg"
          variant="surface"
          disabled={status === 'locating'}
          onClick={() => void locate()}
          iconClassName={cn(location && 'text-official', status === 'locating' && 'opacity-0')}
        />
        {status === 'locating' && (
          <Spinner className="pointer-events-none absolute top-1/2 left-1/2 -translate-1/2 text-official" />
        )}
      </div>
    </div>
  );
}
