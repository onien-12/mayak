import { Check } from 'lucide-react';

import type { UserLevel } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { pluralize, PLURALS } from '@/shared/lib/format';
import { LEVEL_META, LEVELS } from '@/shared/lib/labels';
import { TONES } from '@/shared/lib/tones';
import { StaggerItem } from '@/shared/ui';

import { LEVEL_RULES, levelIndex } from './levels';

/** «Что даёт уровень»: the four levels of SPEC §2 with the current one highlighted. */
export function LevelLadder({ level }: { level: UserLevel }) {
  const current = levelIndex(level);

  return (
    <ol className="flex flex-col gap-2" aria-label="Уровни жителей">
      {LEVELS.map((item, index) => {
        const meta = LEVEL_META[item];
        const rules = LEVEL_RULES[item];
        const Icon = meta.icon;
        const active = index === current;
        const passed = index < current;
        return (
          <StaggerItem
            key={item}
            index={index}
            aria-current={active ? 'step' : undefined}
            className={cn(
              'flex gap-3 rounded-card border p-3',
              active ? 'border-brand bg-brand-soft/60' : 'border-line/70 bg-surface',
            )}
          >
            <span
              className={cn(
                'relative flex size-10 shrink-0 items-center justify-center rounded-full',
                TONES[meta.tone].soft,
              )}
            >
              <Icon size={19} aria-hidden />
              {passed && (
                <span className="absolute -right-0.5 -bottom-0.5 flex size-4 items-center justify-center rounded-full bg-success text-white ring-2 ring-surface">
                  <Check size={10} strokeWidth={3} aria-hidden />
                </span>
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline gap-x-2 text-base font-semibold text-ink">
                {meta.label}
                <span className="text-xs font-normal text-ink-soft">
                  {meta.from === 0 ? 'с первого дня' : `от ${pluralize(meta.from, PLURALS.point)}`}
                </span>
                {active && (
                  <span className="rounded-full bg-brand px-2 text-2xs leading-[18px] font-semibold text-white">
                    Вы здесь
                  </span>
                )}
              </p>
              <ul className="mt-1 flex flex-col gap-0.5 text-sm text-ink-soft">
                <li>{rules.influence}</li>
                <li>{rules.publishing}</li>
                <li>До {pluralize(rules.placesPerDay, PLURALS.place)} в день</li>
                {item === 'newcomer' && <li>Респекты другим — с уровня «Житель»</li>}
              </ul>
            </div>
          </StaggerItem>
        );
      })}
    </ol>
  );
}
