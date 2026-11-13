import { MapPinPlus, SearchX } from 'lucide-react';
import type { ReactNode } from 'react';

import { requireAuth } from '@/features/auth';
import { useAreaParam } from '@/features/map';
import { openCreatePlace } from '@/features/places';
import { ApiError, type AreaDetail } from '@/shared/api';
import { pluralize, PLURALS } from '@/shared/lib/format';
import type { LatLng } from '@/shared/lib/geo';
import { AREA_KIND_META } from '@/shared/lib/labels';
import { Button, EmptyState, ErrorState, PanelLayout, Skeleton } from '@/shared/ui';

import { shownInterest } from '../lib/interest';
import { AreaActions } from './AreaActions';
import { AreaBody } from './AreaBody';
import { useArea } from './useArea';
import { useAreaMapFocus } from './useAreaMapFocus';

/** The linked 2GIS object of an area, handed to the notes slot. */
export interface AreaNotesTarget {
  objectId: string;
  /** The area's label point — where a notes thread opens on the map. */
  point: LatLng;
}

interface AreaPanelProps {
  areaId: number;
  /**
   * Slot for the notes of the linked 2GIS object — rendered inside the card when the area
   * has an `object_id` (the spot feature owns notes and plugs its preview in here).
   */
  renderNotes?: (target: AreaNotesTarget) => ReactNode;
}

function AreaSkeleton() {
  return (
    <div className="flex flex-col gap-4 px-4 lg:px-5" role="status" aria-label="Загрузка">
      <Skeleton className="h-48 rounded-card" />
      <Skeleton className="h-7 w-2/3" />
      <Skeleton className="h-32 rounded-card" />
      <Skeleton className="h-24 rounded-card" />
    </div>
  );
}

function subtitle(area: AreaDetail): string {
  const interest = shownInterest(area);
  return [
    AREA_KIND_META[area.kind].label,
    pluralize(area.places_count, PLURALS.place),
    `${interest.tier.label}${interest.personal ? ' для вас' : ''}`,
  ].join(' · ');
}

/** The area (location) card — shown on top of any panel section via `?area=<id>`. */
export function AreaPanel({ areaId, renderNotes }: AreaPanelProps) {
  const { closeArea } = useAreaParam();
  const { data: area, isPending, isError, error, refetch } = useArea(areaId);
  useAreaMapFocus(area);

  const notFound = error instanceof ApiError && error.status === 404;
  const addPlace = (target: AreaDetail) =>
    requireAuth(
      () => openCreatePlace({ areaId: target.id, pointHint: { lat: target.lat, lng: target.lng } }),
      'чтобы добавить место',
    );

  return (
    <PanelLayout
      title={area?.title ?? (isError ? 'Локация недоступна' : 'Загружаем…')}
      subtitle={area && subtitle(area)}
      onBack={closeArea}
      backLabel="Закрыть локацию"
      actions={area && <AreaActions area={area} />}
      footer={
        area && (
          <Button block size="lg" icon={MapPinPlus} onClick={() => addPlace(area)}>
            Добавить место сюда
          </Button>
        )
      }
      flush
    >
      {isPending && <AreaSkeleton />}
      {isError &&
        (notFound ? (
          <EmptyState
            icon={SearchX}
            title="Локация не найдена"
            description="Возможно, её удалили или объединили с другой."
            action={
              <Button variant="secondary" size="sm" onClick={closeArea}>
                Вернуться к карте
              </Button>
            }
          />
        ) : (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ))}
      {area && (
        <AreaBody
          area={area}
          notes={
            area.object_id && renderNotes
              ? renderNotes({
                  objectId: area.object_id,
                  point: { lat: area.lat, lng: area.lng },
                })
              : undefined
          }
        />
      )}
    </PanelLayout>
  );
}
