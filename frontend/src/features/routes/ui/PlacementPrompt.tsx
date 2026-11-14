import { Crosshair, MousePointerClick, X } from 'lucide-react';
import { motion } from 'motion/react';

import { Button, riseVariants } from '@/shared/ui';

interface PlacementPromptProps {
  /** «Нажмите на карту — там будет этап 3». */
  text: string;
  onCenter: () => void;
  /** Absent when there is nothing to go back to (a new stage waiting for its point). */
  onCancel?: () => void;
}

/**
 * «Добавить точку / этап» pressed: what to do next, in plain sight — tap the map, or put it in
 * the middle of the map and move it later.
 */
export function PlacementPrompt({ text, onCenter, onCancel }: PlacementPromptProps) {
  return (
    <motion.div
      variants={riseVariants}
      initial="hidden"
      animate="visible"
      role="status"
      className="flex flex-col gap-2 rounded-card border-2 border-brand bg-surface p-3 shadow-float"
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-ink">
        <MousePointerClick size={18} aria-hidden className="shrink-0 text-brand" />
        {text}
      </p>
      <div className="flex gap-2">
        <Button size="sm" icon={Crosshair} onClick={onCenter} className="flex-1">
          Поставить в центре карты
        </Button>
        {onCancel && (
          <Button size="sm" variant="secondary" icon={X} onClick={onCancel}>
            Отмена
          </Button>
        )}
      </div>
    </motion.div>
  );
}
