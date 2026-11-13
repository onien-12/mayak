import { Clock, Sprout } from 'lucide-react';

import type { UserPermissions } from '@/shared/api';
import { plural, PLURALS } from '@/shared/lib/format';
import { Banner } from '@/shared/ui';

/** Explains before submitting what will happen: cold mode for newcomers and the daily limit. */
export function PublishNotice({ permissions }: { permissions: UserPermissions }) {
  const left = permissions.places_left_today;
  const limit = `Сегодня можно добавить ещё ${left} ${plural(left, PLURALS.publicationAcc)} из ${permissions.daily_place_limit}.`;

  if (left <= 0) {
    return (
      <Banner tone="warning" icon={Clock} title="Дневной лимит исчерпан">
        Сегодня вы уже добавили {permissions.daily_place_limit}{' '}
        {plural(permissions.daily_place_limit, PLURALS.publicationAcc)}. Возвращайтесь завтра — а
        пока можно подтверждать места других жителей.
      </Banner>
    );
  }

  if (!permissions.publishes_directly) {
    return (
      <Banner tone="infrastructure" icon={Sprout} title="Публикация появится после проверки">
        Вы пока новичок, поэтому первые публикации смотрит модератор — обычно это быстро. Наберите
        10 баллов репутации (например, подтверждая чужие места) и будете публиковать сразу. {limit}
      </Banner>
    );
  }

  return (
    <p className="text-xs text-ink-faint">
      Публикация появится на карте после автоматической проверки — обычно это несколько секунд.{' '}
      {limit}
    </p>
  );
}
