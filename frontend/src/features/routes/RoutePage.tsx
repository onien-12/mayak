import { Footprints, MapPinOff } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';

import { useMapActions } from '@/features/map';
import type { RouteDetail } from '@/shared/api';
import { formatDistance, formatDuration } from '@/shared/lib/format';
import { ROUTE_KIND_META } from '@/shared/lib/labels';
import {
  Button,
  buttonClasses,
  EmptyState,
  ErrorState,
  OsmCredit,
  PanelLayout,
  Skeleton,
  usePanelStore,
} from '@/shared/ui';

import { numberStops } from './lib/stops';
import { RouteMapLayer } from './map/RouteMapLayer';
import { RouteMenu } from './page/RouteActions';
import { RouteOverview } from './page/RouteOverview';
import { useQuest } from './quests/useQuests';
import { isNotFound, parseRouteId, useRoute } from './useRoute';
import { useWalkParam } from './walk/useWalkParam';
import { WalkMode } from './walk/WalkMode';

function RouteView({ route }: { route: RouteDetail }) {
  const navigate = useNavigate();
  const { startWalk } = useWalkParam();
  const { flyTo } = useMapActions();
  const reveal = usePanelStore((state) => state.reveal);
  const stops = useMemo(() => numberStops(route), [route]);
  const [active, setActive] = useState<number | null>(null);
  const [scrollSignal, setScrollSignal] = useState(0);

  const selectFromList = (position: number) => {
    setActive(position);
    const stop = stops.find((item) => item.stop.position === position)?.stop;
    if (stop) flyTo(stop, { minZoom: 15 });
  };

  const selectFromMap = (position: number) => {
    setActive(position);
    reveal();
    setScrollSignal((value) => value + 1);
  };

  const subtitle = [
    ROUTE_KIND_META[route.kind].label,
    formatDistance(route.distance_m),
    formatDuration(route.duration_min),
  ].join(' · ');

  return (
    <>
      <RouteMapLayer
        path={route.path}
        stops={stops}
        activePosition={active}
        onStopClick={selectFromMap}
      />
      <PanelLayout
        title={route.title}
        subtitle={subtitle}
        onBack={() => navigate('/routes')}
        backLabel="К маршрутам"
        actions={<RouteMenu route={route} />}
        footer={
          <>
            <Button block size="lg" icon={Footprints} onClick={startWalk}>
              Пройти маршрут
            </Button>
            {route.path_source === 'osm' && (
              <p className="mt-1.5 text-center leading-none">
                <OsmCredit prefix="Линия маршрута: " className="text-2xs" />
              </p>
            )}
          </>
        }
      >
        <RouteOverview
          route={route}
          stops={stops}
          activePosition={active}
          onSelectStop={selectFromList}
          scrollSignal={scrollSignal}
        />
      </PanelLayout>
    </>
  );
}

/** `/routes/:id` — the route on the map with its story, stops and reviews; `?walk=1` walks it. */
export default function RoutePage() {
  const navigate = useNavigate();
  const id = parseRouteId(useParams().id);
  const { walking, stopWalk } = useWalkParam();
  const route = useRoute(id);
  const quest = useQuest(isNotFound(route.error) ? id : NaN);

  if (route.data) {
    if (walking) return <WalkMode key={route.data.id} route={route.data} onExit={stopWalk} />;
    return <RouteView key={route.data.id} route={route.data} />;
  }

  const missing = Number.isNaN(id) || isNotFound(route.error);
  // A quest is a route underneath (SPEC §27): old links to its route id open the quest.
  if (missing && quest.data) return <Navigate to={`/quests/${quest.data.id}`} replace />;

  return (
    <PanelLayout title="Маршрут" onBack={() => navigate('/routes')} backLabel="К маршрутам">
      {missing ? (
        <EmptyState
          icon={MapPinOff}
          title="Маршрут не найден"
          description="Возможно, его удалили, он личный или ещё на проверке у модератора."
          action={
            <Link to="/routes" className={buttonClasses({ variant: 'secondary' })}>
              Все маршруты
            </Link>
          }
        />
      ) : route.isError ? (
        <ErrorState error={route.error} onRetry={() => void route.refetch()} />
      ) : (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-6 w-2/3 rounded-full" />
          <div className="grid grid-cols-2 gap-2">
            {[0, 1, 2, 3].map((item) => (
              <Skeleton key={item} className="h-16 rounded-control" />
            ))}
          </div>
          <Skeleton className="h-16 rounded-control" />
          <Skeleton className="h-40 rounded-card" />
        </div>
      )}
    </PanelLayout>
  );
}
