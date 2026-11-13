import { Lock, MapPinOff } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';

import { RequireAuth, useAuth } from '@/features/auth';
import type { RouteDetail } from '@/shared/api';
import { EmptyState, ErrorState, PanelLayout, Skeleton } from '@/shared/ui';

import { BuilderSession } from './builder/BuilderSession';
import { draftFromRoute, emptyDraft } from './builder/model';
import { isNotFound, parseRouteId, useRoute } from './useRoute';

function EditSession({ route }: { route: RouteDetail }) {
  const initial = useMemo(() => draftFromRoute(route), [route]);
  return <BuilderSession initial={initial} routeId={route.id} />;
}

function EditLoader({ routeId }: { routeId: number }) {
  const navigate = useNavigate();
  const route = useRoute(routeId);
  // The loaded route seeds the session once; later refetches must not reset the work.
  const loaded = route.data;

  if (loaded?.can_edit) return <EditSession key={loaded.id} route={loaded} />;

  return (
    <PanelLayout
      title="Редактирование"
      onBack={() => navigate(`/routes/${routeId}`)}
      backLabel="К маршруту"
    >
      {loaded ? (
        <EmptyState
          icon={Lock}
          title="Это чужой маршрут"
          description="Редактировать маршрут может только автор или модератор."
        />
      ) : isNotFound(route.error) ? (
        <EmptyState
          icon={MapPinOff}
          title="Маршрут не найден"
          description="Возможно, его уже удалили."
        />
      ) : route.isError ? (
        <ErrorState error={route.error} onRetry={() => void route.refetch()} />
      ) : (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-16 rounded-card" />
          ))}
        </div>
      )}
    </PanelLayout>
  );
}

function NewSession() {
  const initial = useMemo(() => emptyDraft(), []);
  return <BuilderSession initial={initial} routeId={null} />;
}

/** `/routes/new` and `/routes/:id/edit` — the route builder (signed-in users only). */
export default function RouteBuilder() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return (
      <PanelLayout
        title="Конструктор маршрута"
        onBack={() => navigate('/routes')}
        backLabel="К маршрутам"
      >
        <RequireAuth reason="чтобы собрать свой маршрут">{null}</RequireAuth>
      </PanelLayout>
    );
  }
  return id === undefined ? <NewSession /> : <EditLoader routeId={parseRouteId(id)} />;
}
