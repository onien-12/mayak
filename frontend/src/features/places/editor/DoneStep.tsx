import { useEffect } from 'react';

import type { PlaceDetail } from '@/shared/api';
import { LAYER_META } from '@/shared/lib/labels';
import { Button, Rise, SuccessCheck } from '@/shared/ui';

const AUTO_OPEN_MS = 2200;

interface DoneStepProps {
  place: PlaceDetail;
  edited: boolean;
  onOpen: () => void;
}

/** Calm success state: what happened to the publication and a way to its card. */
export function DoneStep({ place, edited, onOpen }: DoneStepProps) {
  const pending = place.status === 'pending';

  useEffect(() => {
    const timer = window.setTimeout(onOpen, AUTO_OPEN_MS);
    return () => window.clearTimeout(timer);
  }, [onOpen]);

  return (
    <div className="flex h-full flex-col items-center justify-center px-6 pb-10 text-center">
      <SuccessCheck />
      <Rise delay={0.3}>
        <h2 className="mt-5 font-display text-xl font-semibold text-ink">
          {edited ? 'Изменения сохранены' : pending ? 'Отправлено на проверку' : 'Опубликовано!'}
        </h2>
        <p className="mx-auto mt-2 max-w-xs text-sm text-ink-soft">
          {pending
            ? 'Модератор посмотрит публикацию, и она появится на карте для всех. Вы уже видите её у себя.'
            : `${LAYER_META[place.layer].createTitle} «${place.title}» теперь на карте. Соседи смогут подтвердить информацию.`}
        </p>
        <Button className="mt-6" onClick={onOpen}>
          Открыть карточку
        </Button>
      </Rise>
    </div>
  );
}
