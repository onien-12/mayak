import { CircleAlert, Clock, EyeOff, Lock } from 'lucide-react';

import type { RouteDetail } from '@/shared/api';
import { Banner } from '@/shared/ui';

/** Explains to the author (or a moderator) why the route is not visible to everyone. */
export function RouteStateBanner({ route }: { route: RouteDetail }) {
  if (route.visibility === 'private') {
    return (
      <Banner tone="neutral" icon={Lock} title="Только для вас">
        Личный маршрут: его видите только вы, он не проходит модерацию. Опубликовать можно в
        редакторе.
      </Banner>
    );
  }
  switch (route.status) {
    case 'pending':
      return (
        <Banner tone="infrastructure" icon={Clock} title="На проверке у модератора">
          Маршрут появится в каталоге после проверки — обычно это быстро. Ссылка уже работает для
          вас.
        </Banner>
      );
    case 'needs_review':
      return (
        <Banner tone="warning" icon={CircleAlert} title="Требует уточнения">
          На маршрут пожаловались — модератор проверяет, всё ли в порядке.
        </Banner>
      );
    case 'hidden':
      return (
        <Banner tone="danger" icon={EyeOff} title="Скрыт модератором">
          Маршрут не виден другим жителям, но остаётся у вас: его можно пройти, распечатать или
          сделать личным в редакторе.
        </Banner>
      );
    default:
      return null;
  }
}
