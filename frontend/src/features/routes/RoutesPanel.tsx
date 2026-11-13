import { ArrowRight, Plus, RotateCcw, Route as RouteIcon, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { requireAuth, useAuth } from '@/features/auth';
import type { RouteCard } from '@/shared/api';
import { useIsDesktop } from '@/shared/hooks';
import { formatDistance, formatDuration, pluralize, PLURALS } from '@/shared/lib/format';
import { ROUTE_KIND_META } from '@/shared/lib/labels';
import {
  Button,
  EmptyState,
  ErrorState,
  IconButton,
  ListSkeleton,
  MapTopBar,
  PanelLayout,
  Spinner,
  StaggerItem,
  Tabs,
  usePanelStore,
} from '@/shared/ui';

import { CatalogMapLayer } from './catalog/CatalogMapLayer';
import { DifficultyAndSort, KindChips, RouteSearchField } from './catalog/CatalogFilters';
import { countCatalogFilters, useCatalogFilters, type CatalogScope } from './catalog/catalogStore';
import { RouteListItem } from './catalog/RouteListItem';
import { useRoutesCatalog } from './catalog/useRoutesCatalog';

function catalogTitle(count: number | undefined, mine: boolean): string {
  if (count === undefined) return 'Маршруты';
  if (count === 0) return mine ? 'Пока нет маршрутов' : 'Ничего не нашлось';
  return pluralize(count, PLURALS.route);
}

/**
 * «Маршруты»: public routes with kind / difficulty / search filters and sorting, the
 * user's own routes, start pins on the map and a line preview of the chosen card.
 */
export default function RoutesPanel() {
  const isDesktop = useIsDesktop();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const filters = useCatalogFilters();
  const catalog = useRoutesCatalog();
  const reveal = usePanelStore((state) => state.reveal);
  const showMap = usePanelStore((state) => state.showMap);
  const [previewed, setPreviewed] = useState<RouteCard | null>(null);
  const activeFilters = countCatalogFilters(filters);

  const create = () => requireAuth(() => navigate('/routes/new'), 'чтобы собрать свой маршрут');

  const preview = (route: RouteCard | null) => {
    setPreviewed(route);
    if (route && !isDesktop) showMap();
  };

  const selectOnMap = (route: RouteCard) => {
    if (previewed?.id === route.id) navigate(`/routes/${route.id}`);
    else setPreviewed(route);
  };

  // Phone, a line on the map: the sheet header (all that is visible at peek) names it.
  const previewHeader =
    !isDesktop && previewed
      ? {
          title: previewed.title,
          subtitle: `${ROUTE_KIND_META[previewed.kind].label} · ${formatDistance(previewed.distance_m)} · ${formatDuration(previewed.duration_min)}`,
          actions: (
            <>
              <IconButton icon={X} label="Скрыть линию" onClick={() => setPreviewed(null)} />
              <IconButton
                icon={ArrowRight}
                label="Открыть маршрут"
                variant="solid"
                onClick={() => navigate(`/routes/${previewed.id}`)}
              />
            </>
          ),
        }
      : null;

  const list = (
    <div className="flex flex-col gap-3">
      {isAuthenticated && (
        <Tabs<CatalogScope>
          label="Какие маршруты показать"
          value={filters.scope}
          onChange={filters.setScope}
          tabs={[
            { value: 'all', label: 'Все маршруты' },
            { value: 'mine', label: 'Мои маршруты' },
          ]}
        />
      )}
      {/* Phones: the kind filter belongs to the list it filters, not to the map above it. */}
      {!isDesktop && <KindChips />}
      <DifficultyAndSort sortable={!catalog.mine} />
      {catalog.isPending && <ListSkeleton rows={4} />}
      {catalog.isError && (
        <ErrorState error={catalog.error} onRetry={() => void catalog.refetch()} />
      )}
      {catalog.routes?.length === 0 &&
        (catalog.mine && activeFilters === 0 ? (
          <EmptyState
            icon={RouteIcon}
            title="Соберите первый маршрут"
            description="Прогулка по любимым местам, поход выходного дня или экскурсия для гостей города — с точками, фото и ориентирами."
            action={
              <Button icon={Plus} onClick={create}>
                Создать маршрут
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={RouteIcon}
            title="Таких маршрутов пока нет"
            description="Попробуйте убрать часть фильтров — или соберите такой маршрут сами."
            action={
              <Button variant="secondary" icon={RotateCcw} onClick={filters.reset}>
                Сбросить фильтры
              </Button>
            }
          />
        ))}
      {catalog.routes && catalog.routes.length > 0 && (
        <ul className="flex flex-col gap-2">
          {catalog.routes.map((route, index) => (
            <StaggerItem key={route.id} index={index}>
              <RouteListItem
                route={route}
                highlighted={previewed?.id === route.id}
                onPreview={preview}
                showState={catalog.mine}
              />
            </StaggerItem>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <>
      {catalog.routes && (
        <CatalogMapLayer routes={catalog.routes} previewed={previewed} onSelect={selectOnMap} />
      )}
      {!isDesktop && (
        <MapTopBar>
          <RouteSearchField pill onFocus={reveal} />
        </MapTopBar>
      )}
      <PanelLayout
        {...(previewHeader ?? {
          title: catalogTitle(catalog.routes?.length, catalog.mine),
          subtitle: catalog.mine
            ? 'Личные планы и публикации'
            : 'Прогулки, походы и экскурсии от жителей',
          actions: (
            <>
              {catalog.isRefreshing && <Spinner size={16} className="mr-2" />}
              {activeFilters > 0 && (
                <IconButton icon={RotateCcw} label="Сбросить фильтры" onClick={filters.reset} />
              )}
            </>
          ),
        })}
        toolbar={
          isDesktop && (
            <div className="flex flex-col gap-3">
              <RouteSearchField />
              <KindChips />
            </div>
          )
        }
        footer={
          <Button block size="lg" icon={Plus} onClick={create}>
            Создать маршрут
          </Button>
        }
      >
        {list}
      </PanelLayout>
    </>
  );
}
