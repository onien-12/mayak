import { Check, Lock, Sprout, Users } from 'lucide-react';
import { motion } from 'motion/react';

import { useAuth } from '@/features/auth';
import type { RouteVisibility } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { Banner, SPRING } from '@/shared/ui';

import { useBuilderStore } from './store';

const OPTIONS: { value: RouteVisibility; title: string; text: string; icon: typeof Lock }[] = [
  {
    value: 'private',
    title: 'Только для меня',
    text: 'Личный план: виден только вам, без модерации. Опубликовать можно позже.',
    icon: Lock,
  },
  {
    value: 'public',
    title: 'Опубликовать для всех',
    text: 'Маршрут появится в каталоге: его смогут пройти, сохранить и оценить.',
    icon: Users,
  },
];

/** «Только для меня» / «Опубликовать для всех», with the cold-mode explanation for newcomers. */
export function VisibilityPicker() {
  const visibility = useBuilderStore((state) => state.draft.visibility);
  const setMeta = useBuilderStore((state) => state.setMeta);
  const { permissions } = useAuth();
  const premoderated =
    visibility === 'public' && permissions !== null && !permissions.publishes_directly;

  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-label="Кто увидит маршрут" className="grid gap-2 sm:grid-cols-2">
        {OPTIONS.map((option) => {
          const selected = visibility === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setMeta({ visibility: option.value })}
              className={cn(
                'relative flex gap-3 rounded-card border p-3.5 text-left transition-[border-color,background-color,transform] duration-150 active:scale-[0.98]',
                selected
                  ? 'border-brand bg-brand-soft/60'
                  : 'border-line hover:border-ink-faint/60',
              )}
            >
              <span
                className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-full transition-colors',
                  selected ? 'bg-brand text-white' : 'bg-canvas text-ink-soft',
                )}
              >
                <option.icon size={18} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">{option.title}</span>
                <span className="mt-0.5 block text-xs text-ink-soft">{option.text}</span>
              </span>
              {selected && (
                <motion.span
                  layoutId="visibility-check"
                  transition={SPRING.layout}
                  className="absolute top-2.5 right-2.5 flex size-5 items-center justify-center rounded-full bg-brand text-white"
                >
                  <Check size={12} strokeWidth={3} aria-hidden />
                </motion.span>
              )}
            </button>
          );
        })}
      </div>
      {premoderated && (
        <Banner tone="infrastructure" icon={Sprout} title="Сначала маршрут посмотрит модератор">
          Вы пока новичок, поэтому публичные маршруты проходят проверку — обычно это быстро. До
          публикации маршрут виден вам по ссылке. Наберите 10 баллов репутации, и маршруты будут
          появляться сразу.
        </Banner>
      )}
    </div>
  );
}
