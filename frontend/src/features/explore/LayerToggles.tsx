import type { Layer } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { LAYER_META, LAYERS } from '@/shared/lib/labels';
import { TONES } from '@/shared/lib/tones';

interface LayerTogglesProps {
  active: readonly Layer[];
  onToggle: (layer: Layer) => void;
}

/** Four colour-coded switches — one per map layer. */
export function LayerToggles({ active, onToggle }: LayerTogglesProps) {
  return (
    <div role="group" aria-label="Слои карты" className="grid grid-cols-4 gap-1.5">
      {LAYERS.map((layer) => {
        const meta = LAYER_META[layer];
        const selected = active.includes(layer);
        const Icon = meta.icon;
        return (
          <button
            key={layer}
            type="button"
            aria-pressed={selected}
            title={meta.description}
            onClick={() => onToggle(layer)}
            className={cn(
              'flex flex-col items-center gap-1.5 rounded-control border px-1 pt-2.5 pb-2 text-xs font-medium transition-[background-color,border-color,color] duration-150',
              selected
                ? cn(TONES[layer].soft, 'border-transparent')
                : 'border-line bg-surface text-ink-faint hover:border-ink-faint/60 hover:text-ink-soft',
            )}
          >
            <span
              className={cn(
                'flex size-8 items-center justify-center rounded-[10px] transition-colors duration-150',
                selected ? TONES[layer].solid : 'bg-canvas',
              )}
            >
              <Icon size={17} strokeWidth={2.2} aria-hidden />
            </span>
            <span className="max-w-full truncate">{meta.short}</span>
          </button>
        );
      })}
    </div>
  );
}
