import { motion } from 'motion/react';

import type { StopKind } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { STOP_KIND_META } from '@/shared/lib/labels';
import { TONES } from '@/shared/lib/tones';
import { SPRING } from '@/shared/ui';

export const STOP_PIN_SIZE = 32;
export const VIA_DOT_SIZE = 14;

interface StopPinProps {
  number: number;
  kind: StopKind;
  active?: boolean;
  /** Dimmed while another stop is being edited. */
  muted?: boolean;
}

/** Numbered stop marker: colour and corner glyph by stop kind, beam ring when active. */
export function StopPin({ number, kind, active = false, muted = false }: StopPinProps) {
  const meta = STOP_KIND_META[kind];
  return (
    <motion.span
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{ scale: active ? 1.18 : 1, opacity: muted ? 0.55 : 1 }}
      transition={SPRING.pop}
      style={{ width: STOP_PIN_SIZE, height: STOP_PIN_SIZE }}
      className="relative flex items-center justify-center"
    >
      {active && (
        <span aria-hidden className="absolute -inset-1.5 animate-pulse-ring rounded-full bg-beam" />
      )}
      <span
        className={cn(
          'relative flex size-full items-center justify-center rounded-full border-2 border-white text-sm font-semibold tabular-nums shadow-pin',
          TONES[meta.tone].solid,
          active && 'ring-3 ring-beam',
        )}
      >
        {number}
      </span>
      <span
        aria-hidden
        className={cn(
          'absolute -right-1.5 -bottom-1 flex size-[17px] items-center justify-center rounded-full border border-line bg-white shadow-card',
          TONES[meta.tone].text,
        )}
      >
        <meta.icon size={10} strokeWidth={2.5} />
      </span>
    </motion.span>
  );
}

/** Small shaping point of the track (`via`). */
export function ViaDot({ active = false }: { active?: boolean }) {
  return (
    <motion.span
      initial={{ scale: 0.4, opacity: 0 }}
      animate={{ scale: active ? 1.3 : 1, opacity: 1 }}
      transition={SPRING.pop}
      style={{ width: VIA_DOT_SIZE, height: VIA_DOT_SIZE }}
      className="block rounded-full border-[3px] border-brand bg-white shadow-pin"
    />
  );
}
