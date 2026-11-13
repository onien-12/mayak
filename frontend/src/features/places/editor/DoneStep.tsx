import { ShieldAlert } from 'lucide-react';
import { useEffect } from 'react';

import { queryKeys, rereadAfterCheck, type PlaceDetail } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { LAYER_META } from '@/shared/lib/labels';
import { TONES } from '@/shared/lib/tones';
import { Button, Pop, Rise, SuccessCheck } from '@/shared/ui';

import { usePlace } from '../card/usePlace';

const AUTO_OPEN_MS = 2200;

interface DoneStepProps {
  place: PlaceDetail;
  edited: boolean;
  onOpen: () => void;
}

function message(place: PlaceDetail, edited: boolean): { title: string; text: string } {
  if (place.screening_hold) {
    return {
      title: 'Не прошло автоматическую проверку',
      text: 'Пока публикацию видите только вы: модератор посмотрит её и решит. Причины — в карточке, там же её можно исправить.',
    };
  }
  if (place.status === 'pending') {
    return {
      title: edited ? 'Изменения сохранены' : 'Отправлено на проверку',
      text: 'Модератор посмотрит публикацию, и она появится на карте для всех. Вы уже видите её у себя.',
    };
  }
  return {
    title: edited ? 'Изменения сохранены' : 'Опубликовано!',
    text: `${LAYER_META[place.layer].createTitle} «${place.title}» теперь на карте. Соседи смогут подтвердить информацию.`,
  };
}

/**
 * What happened to the publication and a way to its card. The automatic check answers a few
 * seconds after saving (SPEC §24.1): the place is read again then, and a publication that did
 * not pass says so here (if still open) and in its card.
 */
export function DoneStep({ place: saved, edited, onOpen }: DoneStepProps) {
  const place = usePlace(saved.id).data ?? saved;
  const held = Boolean(place.screening_hold);
  const { title, text } = message(place, edited);

  useEffect(() => {
    rereadAfterCheck([
      queryKeys.places.detail(saved.id),
      queryKeys.places.history(saved.id),
      queryKeys.places.lists,
    ]);
  }, [saved.id]);

  useEffect(() => {
    if (held) return;
    const timer = window.setTimeout(onOpen, AUTO_OPEN_MS);
    return () => window.clearTimeout(timer);
  }, [onOpen, held]);

  return (
    <div className="flex h-full flex-col items-center justify-center px-6 pb-10 text-center">
      {held ? (
        <Pop
          trigger={held}
          className={cn('size-24 items-center justify-center rounded-full', TONES.warning.soft)}
        >
          <ShieldAlert size={44} aria-hidden />
        </Pop>
      ) : (
        <SuccessCheck />
      )}
      <Rise delay={0.3}>
        <h2 className="mt-5 font-display text-xl font-semibold text-ink">{title}</h2>
        <p className="mx-auto mt-2 max-w-xs text-sm text-ink-soft">{text}</p>
        <Button className="mt-6" onClick={onOpen}>
          Открыть карточку
        </Button>
      </Rise>
    </div>
  );
}
