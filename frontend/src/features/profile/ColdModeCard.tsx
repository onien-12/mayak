import { Clock, HandHeart, MapPinPlus, Sprout, Vote } from 'lucide-react';

import type { UserPermissions } from '@/shared/api';
import { pluralize, PLURALS } from '@/shared/lib/format';
import { LEVEL_META } from '@/shared/lib/labels';
import { Rise } from '@/shared/ui';

interface ColdModeCardProps {
  permissions: UserPermissions;
  reputation: number;
}

/** Cold mode for newcomers (SPEC §2): what is limited for now and how to grow out of it. */
export function ColdModeCard({ permissions, reputation }: ColdModeCardProps) {
  const left = Math.max(0, LEVEL_META.resident.from - reputation);
  const limits = [
    { icon: Clock, text: 'Ваши места и маршруты сначала смотрит модератор — обычно в течение дня' },
    {
      icon: MapPinPlus,
      text: `До ${pluralize(permissions.daily_place_limit, PLURALS.place)} в день — сегодня осталось ${permissions.places_left_today}`,
    },
    { icon: HandHeart, text: 'Респекты другим жителям откроются на уровне «Житель»' },
  ];

  return (
    <Rise delay={0.1} className="rounded-panel border border-success/25 bg-success-soft p-5">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-full bg-success text-white">
          <Sprout size={20} aria-hidden />
        </span>
        <div>
          <h2 className="font-display text-base font-semibold text-ink">Режим новичка</h2>
          <p className="text-sm text-success-ink">
            До уровня «Житель» — {pluralize(left, PLURALS.point)}
          </p>
        </div>
      </div>
      <ul className="mt-4 flex flex-col gap-2.5">
        {limits.map(({ icon: Icon, text }) => (
          <li key={text} className="flex gap-2.5 text-sm text-ink">
            <Icon size={16} aria-hidden className="mt-0.5 shrink-0 text-success-ink" />
            {text}
          </li>
        ))}
      </ul>
      <p className="mt-4 flex gap-2.5 rounded-control bg-surface/70 p-3 text-sm text-ink-soft">
        <Vote size={16} aria-hidden className="mt-0.5 shrink-0 text-success-ink" />
        Быстрее всего растёт репутация за проверку мест рядом: отметьте «Присутствует» или
        «Отсутствует» на карточке места (+2 за каждое место).
      </p>
    </Rise>
  );
}
