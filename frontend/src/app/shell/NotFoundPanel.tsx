import { Compass } from 'lucide-react';
import { Link } from 'react-router';

import { buttonClasses, EmptyState, PanelLayout } from '@/shared/ui';

export function NotFoundPanel() {
  return (
    <PanelLayout title="Страница не найдена">
      <EmptyState
        icon={Compass}
        title="Здесь ничего нет"
        description="Возможно, ссылка устарела. Вернитесь к карте — там точно есть что посмотреть."
        action={
          <Link to="/" className={buttonClasses({ size: 'sm' })}>
            Открыть карту
          </Link>
        }
      />
    </PanelLayout>
  );
}
