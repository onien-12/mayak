import { Gauge } from 'lucide-react';

import { SegmentedControl, useGraphicsStore, type GraphicsChoice } from '@/shared/ui';

const OPTIONS = [
  { value: 'auto', label: 'Авто' },
  { value: 'full', label: 'Красивая' },
  { value: 'lite', label: 'Быстрая' },
] as const satisfies readonly { value: GraphicsChoice; label: string }[];

/**
 * «Графика» (`shared/ui/graphics.ts`): the automatic tier, or either tier forced on this
 * device. Picking «Авто» again re-evaluates the device.
 */
export function GraphicsSettings() {
  const choice = useGraphicsStore((state) => state.choice);
  const tier = useGraphicsStore((state) => state.tier);
  const setChoice = useGraphicsStore((state) => state.setChoice);

  const hint =
    choice === 'full'
      ? 'Все эффекты и анимации, как задумано'
      : choice === 'lite'
        ? 'Без размытия и лишних анимаций — плавнее'
        : tier === 'lite'
          ? 'Сейчас быстрая: так плавнее на этом устройстве'
          : 'Сейчас красивая; станет быстрой, если тормозит';

  return (
    <section
      aria-labelledby="graphics-settings"
      className="flex flex-col gap-3 rounded-card border border-line/70 p-4"
    >
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
          <Gauge size={19} aria-hidden />
        </span>
        <h3 id="graphics-settings" className="text-base font-semibold text-ink">
          Графика
        </h3>
      </div>
      <SegmentedControl label="Графика" value={choice} onChange={setChoice} options={OPTIONS} />
      <p className="text-sm text-ink-soft">{hint}</p>
    </section>
  );
}
