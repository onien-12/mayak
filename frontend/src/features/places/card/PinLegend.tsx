import { Check, Clock, ShieldCheck, type LucideIcon } from 'lucide-react';

import type { PlaceDetail } from '@/shared/api';
import { cn } from '@/shared/lib/cn';

interface Mark {
  key: string;
  /** Same look as the corner badge of the map pin. */
  className: string;
  icon?: LucideIcon;
  text?: string;
  title: string;
  meaning: string;
}

/** The corner badges this place's pin carries on the map, in the pin's own order. */
function marksOf(place: PlaceDetail): Mark[] {
  const marks: Mark[] = [];
  const imported = place.external !== null;
  if (place.issue?.source === 'official') {
    marks.push({
      key: 'official',
      className: 'bg-official text-white',
      icon: ShieldCheck,
      title: 'Официальные данные',
      meaning: place.issue.outage
        ? 'об отключении сообщили службы города, а не только жители'
        : 'сведения от ответственной организации, а не только от жителей',
    });
  }
  if (place.status === 'verified') {
    marks.push({
      key: 'verified',
      className: 'bg-success text-white',
      icon: Check,
      title: 'Подтверждено',
      meaning: imported
        ? `сведения из надёжного источника: ${place.external?.label}`
        : 'несколько независимых жителей подтвердили информацию',
    });
  } else if (place.status === 'needs_review') {
    marks.push({
      key: 'needs_review',
      className: 'bg-warning text-ink',
      text: '!',
      title: 'Требует уточнения',
      meaning: 'жители сообщают разное — проверьте на месте',
    });
  } else if (place.status === 'pending') {
    marks.push({
      key: 'pending',
      className: 'bg-ink-soft text-white',
      icon: Clock,
      title: 'На проверке',
      meaning: 'публикацию пока видите только вы',
    });
  }
  return marks;
}

/**
 * «Что значат значки на карте»: the corner badges of this place's pin with their meaning, so
 * the tick and the shield are not left for the reader to guess. Nothing for a pin without badges.
 */
export function PinLegend({ place }: { place: PlaceDetail }) {
  const marks = marksOf(place);
  if (marks.length === 0) return null;

  return (
    <ul aria-label="Значки на карте" className="flex flex-col gap-1.5">
      {marks.map(({ key, className, icon: Icon, text, title, meaning }) => (
        <li key={key} className="flex items-start gap-2 text-sm text-ink-soft">
          <span
            aria-hidden
            className={cn(
              'mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full text-[11px] leading-none font-bold',
              className,
            )}
          >
            {Icon ? <Icon size={11} strokeWidth={3} /> : text}
          </span>
          <span>
            <span className="font-medium text-ink">{title}</span> — {meaning}
          </span>
        </li>
      ))}
    </ul>
  );
}
