import { BookmarkX, Route } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { Link } from 'react-router';

import type { RouteCard } from '@/shared/api';
import { buttonClasses, EmptyState, IconButton } from '@/shared/ui';

import { RemovableItem } from './RemovableItem';
import { RouteRow } from './RouteRow';
import { useUnsaveRoute } from './useFavorites';

/** Saved routes → `/routes/:id`; can be unsaved with undo. */
export function SavedRoutesTab({ routes }: { routes: readonly RouteCard[] }) {
  const unsave = useUnsaveRoute();

  if (routes.length === 0) {
    return (
      <EmptyState
        icon={Route}
        title="Нет сохранённых маршрутов"
        description="Сохраняйте прогулки и походы жителей, чтобы пройти их позже."
        action={
          <Link to="/routes" className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
            Смотреть маршруты
          </Link>
        }
      />
    );
  }

  return (
    <ul aria-label="Сохранённые маршруты" className="flex flex-col gap-2">
      <AnimatePresence initial={false}>
        {routes.map((route, index) => (
          <RemovableItem key={route.id} index={index}>
            <RouteRow
              route={route}
              trailing={
                <IconButton
                  icon={BookmarkX}
                  label="Убрать из сохранённых"
                  onClick={() => unsave.mutate(route)}
                />
              }
            />
          </RemovableItem>
        ))}
      </AnimatePresence>
    </ul>
  );
}
