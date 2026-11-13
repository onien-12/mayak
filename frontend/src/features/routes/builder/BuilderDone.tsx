import { ShieldAlert } from 'lucide-react';
import { useEffect } from 'react';

import { queryKeys, rereadAfterCheck, type RouteDetail } from '@/shared/api';
import { TONES } from '@/shared/lib/tones';
import { Button, Rise, SuccessCheck } from '@/shared/ui';

import { useRoute } from '../useRoute';

const AUTO_OPEN_MS = 2400;

function message(route: RouteDetail, edited: boolean): { title: string; text: string } {
  if (route.visibility === 'private') {
    return {
      title: edited ? 'Изменения сохранены' : 'Маршрут сохранён',
      text: 'Он виден только вам: можно пройти его с телефона, распечатать или скачать GPX.',
    };
  }
  if (route.screening_hold) {
    return {
      title: 'Не прошло автоматическую проверку',
      text: 'Пока маршрут видите только вы: модератор посмотрит его и решит. Причины — на странице маршрута, там же его можно исправить.',
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

/**
 * Calm success state after saving, then the route page. The automatic check answers a few
 * seconds after saving (SPEC §24.1): the route is read again then, and one that did not pass
 * says so here (if still open) and on its page.
 */
export function BuilderDone({ route: saved, edited, onOpen }: BuilderDoneProps) {
  const route = useRoute(saved.id).data ?? saved;
  const held = Boolean(route.screening_hold);
  const { title, text } = message(route, edited);

  useEffect(() => {
    if (saved.visibility === 'public') rereadAfterCheck([queryKeys.routes.detail(saved.id)]);
  }, [saved.id, saved.visibility]);

  useEffect(() => {
    if (held) return;
    const timer = window.setTimeout(onOpen, AUTO_OPEN_MS);
    return () => window.clearTimeout(timer);
  }, [onOpen, held]);

  return (
    <div className="flex h-full flex-col items-center justify-center px-6 pt-6 pb-10 text-center">
      {held ? (
        <ShieldAlert size={64} aria-hidden className={TONES.warning.text} />
      ) : (
        <SuccessCheck />
      )}
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
