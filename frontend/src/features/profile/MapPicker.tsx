import { Move } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { MapCircle, usePickPoint } from '@/features/map';
import type { LatLng } from '@/shared/lib/geo';
import { LAYER_META } from '@/shared/lib/labels';
import { Button, SPRING, TWEEN, useMinimizeOverlay } from '@/shared/ui';

interface MapPickerProps {
  open: boolean;
  title: string;
  /** Where to start; `null` keeps the current map centre. */
  initial?: LatLng | null;
  /** Draws a live circle of this radius around the picked point. */
  radiusM?: number;
  confirmLabel: string;
  confirmDisabled?: boolean;
  loading?: boolean;
  onConfirm: (point: LatLng) => void;
  onCancel: () => void;
  /** Extra controls under the title (radius, layers, name…). */
  children?: ReactNode;
}

/**
 * "Pick a point on the map" from an overlay page. The page slides away and reveals the map
 * with a pin fixed in the centre — the user drags the map under it, the circle follows — while
 * a compact card in the thumb zone holds the settings and the confirm button. Chosen over
 * "use the current map centre" because on a phone the user sees exactly what they pick and
 * never loses the form.
 */
export function MapPicker({
  open,
  title,
  initial,
  radiusM,
  confirmLabel,
  confirmDisabled = false,
  loading = false,
  onConfirm,
  onCancel,
  children,
}: MapPickerProps) {
  useMinimizeOverlay(open);
  const { point } = usePickPoint(open, initial);

  return createPortal(
    <>
      {open && point && radiusM !== undefined && (
        <MapCircle center={point} radiusM={radiusM} color={LAYER_META.event.color} />
      )}
      <AnimatePresence>
        {open && (
          <motion.p
            key="hint"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: TWEEN.fast }}
            transition={SPRING.sheet}
            className="pointer-events-none fixed inset-x-0 top-[max(12px,env(safe-area-inset-top))] z-40 mx-auto flex w-max max-w-[calc(100%-32px)] items-center gap-2 rounded-full bg-ink/85 px-4 py-2.5 text-sm font-medium text-white shadow-float backdrop-blur"
          >
            <Move size={16} aria-hidden className="shrink-0 text-beam" />
            Двигайте карту — центр под булавкой
          </motion.p>
        )}
        {open && (
          <motion.section
            key="card"
            role="dialog"
            aria-label={title}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0, transition: TWEEN.fast }}
            transition={SPRING.sheet}
            className="fixed inset-x-0 bottom-[calc(60px+env(safe-area-inset-bottom,0px))] z-40 flex flex-col gap-3 rounded-t-panel border-t border-line/70 bg-surface/95 px-4 pt-4 pb-3 shadow-float backdrop-blur lg:inset-x-auto lg:bottom-6 lg:left-[100px] lg:w-[400px] lg:rounded-panel lg:border lite:bg-surface"
          >
            <h2 className="font-display text-base font-semibold text-ink">{title}</h2>
            {children}
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={onCancel}>
                Отмена
              </Button>
              <Button
                className="flex-1"
                loading={loading}
                disabled={!point || confirmDisabled}
                onClick={() => point && onConfirm(point)}
              >
                {confirmLabel}
              </Button>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </>,
    document.body,
  );
}
