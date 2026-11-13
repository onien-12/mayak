import { Check, Flag } from 'lucide-react';
import { motion } from 'motion/react';

import { MapHtmlMarker } from '@/features/map';
import { cn } from '@/shared/lib/cn';
import type { LatLng } from '@/shared/lib/geo';
import { SPRING } from '@/shared/ui';

const PIN = 32;

interface StartMarkerProps {
  position: LatLng;
  label: string;
  active?: boolean;
  onClick?: () => void;
}

/** The start of a quest: the only point of it everyone sees. */
export function StartMarker({ position, label, active = false, onClick }: StartMarkerProps) {
  return (
    <MapHtmlMarker position={position} anchor={[PIN / 2, PIN / 2]} zIndex={active ? 44 : 32}>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        style={{ width: PIN, height: PIN }}
        className={cn(
          'flex animate-pop-in items-center justify-center rounded-full border-2 border-white bg-event text-white shadow-pin transition-transform duration-150',
          active && 'scale-125 ring-3 ring-beam',
        )}
      >
        <Flag size={15} aria-hidden />
      </button>
    </MapHtmlMarker>
  );
}

/** A stage already passed: its number with a check. */
export function PassedMarker({ position, number }: { position: LatLng; number: number }) {
  return (
    <MapHtmlMarker position={position} anchor={[PIN / 2, PIN / 2]} zIndex={34} passive>
      <motion.span
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={SPRING.pop}
        style={{ width: PIN, height: PIN }}
        className="relative flex items-center justify-center rounded-full border-2 border-white bg-success text-sm font-semibold text-white tabular-nums shadow-pin"
        aria-label={`Пройденный этап ${number}`}
      >
        {number}
        <span className="absolute -right-1.5 -bottom-1 flex size-[17px] items-center justify-center rounded-full border border-line bg-white text-success shadow-card">
          <Check size={11} strokeWidth={3} aria-hidden />
        </span>
      </motion.span>
    </MapHtmlMarker>
  );
}
