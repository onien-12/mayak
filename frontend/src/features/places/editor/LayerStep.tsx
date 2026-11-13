import { ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';

import type { Layer } from '@/shared/api';
import { LAYER_META, LAYERS } from '@/shared/lib/labels';
import { LayerIcon, PRESS_SCALE, StaggerItem, TWEEN } from '@/shared/ui';

/** Step 1: what are we adding? Four cards, one per layer. */
export function LayerStep({ onPick }: { onPick: (layer: Layer) => void }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {LAYERS.map((layer, index) => {
        const meta = LAYER_META[layer];
        return (
          <StaggerItem key={layer} index={index}>
            <motion.button
              type="button"
              whileTap={{ scale: PRESS_SCALE }}
              transition={TWEEN.fast}
              onClick={() => onPick(layer)}
              className="flex w-full items-center gap-3.5 rounded-card border border-line bg-surface p-3.5 text-left transition-[border-color,box-shadow] duration-150 hover:border-ink-faint/60 hover:shadow-card"
            >
              <LayerIcon layer={layer} size={48} variant="solid" />
              <span className="min-w-0 flex-1">
                <span className="block text-base font-semibold text-ink">{meta.createTitle}</span>
                <span className="mt-0.5 block text-sm text-ink-soft">{meta.examples}</span>
              </span>
              <ChevronRight size={20} aria-hidden className="shrink-0 text-ink-faint" />
            </motion.button>
          </StaggerItem>
        );
      })}
    </ul>
  );
}
