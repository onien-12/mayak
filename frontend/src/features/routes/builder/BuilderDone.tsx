import { useEffect } from 'react';

import type { RouteDetail } from '@/shared/api';
import { Button, Rise, SuccessCheck } from '@/shared/ui';

const AUTO_OPEN_MS = 2400;

function message(route: RouteDetail, edited: boolean): { title: string; text: string } {
  if (route.visibility === 'private') {
    return {
      title: edited ? 'Изменения сохранены' : 'Маршрут сохранён',
      text: 'Он виден только вам: можно пройти его с телефона, распечатать или скачать GPX.',
    };
  }
  if (route.status === 'pending') {
    return {
      title: 'Отправлено на проверку',
      text: 'Модератор посмотрит маршрут, и он появится в каталоге. Вам он уже доступен по ссылке.',
    };
  }
  return {
    title: edited ? 'Изменения сохранены' : 'Маршрут опубликован!',
    text: `«${route.title}» теперь в каталоге — жители смогут пройти его, сохранить и оценить.`,
  };
}

interface BuilderDoneProps {
  route: RouteDetail;
  edited: boolean;
  onOpen: () => void;
}

/** Calm success state after saving, then the route page. */
export function BuilderDone({ route, edited, onOpen }: BuilderDoneProps) {
  const { title, text } = message(route, edited);

  useEffect(() => {
    const timer = window.setTimeout(onOpen, AUTO_OPEN_MS);
    return () => window.clearTimeout(timer);
  }, [onOpen]);

  return (
    <div className="flex h-full flex-col items-center justify-center px-6 pt-6 pb-10 text-center">
      <SuccessCheck />
      <Rise delay={0.3}>
        <h2 className="mt-5 font-display text-xl font-semibold text-ink">{title}</h2>
        <p className="mx-auto mt-2 max-w-xs text-sm text-ink-soft">{text}</p>
        <Button className="mt-6" onClick={onOpen}>
          Открыть маршрут
        </Button>
      </Rise>
    </div>
  );
}
