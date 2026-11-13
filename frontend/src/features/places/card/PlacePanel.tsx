import { CalendarPlus, MapPin, SearchX } from 'lucide-react';
import { useEffect, useState } from 'react';

import { requireAuth } from '@/features/auth';
import { TopicChips } from '@/features/interests';
import {
  useMapActions,
  useMapFocusPlace,
  useMapUnfoldArea,
  usePlaceParam,
  useUserLocation,
} from '@/features/map';
import { ApiError, type PlaceDetail } from '@/shared/api';
import { formatDistance } from '@/shared/lib/format';
import { haversine } from '@/shared/lib/geo';
import { LAYER_META } from '@/shared/lib/labels';
import { TONES } from '@/shared/lib/tones';
import {
  Button,
  EmptyState,
  ErrorState,
  PanelLayout,
  Rise,
  Skeleton,
  TextCreditNote,
} from '@/shared/ui';

import { openCreatePlace } from '../editor/editorStore';
import { externalTarget, isExternalReviewsTarget } from '../external/api';
import { RatingSummary } from '../external/RatingSummary';
import { AddPhotosButton } from './AddPhotosButton';
import { AppealDialog } from './AppealDialog';
import { AreaBreadcrumb } from './AreaBreadcrumb';
import { AttributesBlock } from './AttributesBlock';
import { hasCompactCard } from './compactCard';
import { ElsewhereLinks } from './ElsewhereLinks';
import { EventSection } from './EventSection';
import { IssueSection } from './IssueSection';
import { PlaceActions } from './PlaceActions';
import { PlaceGallery } from './PlaceGallery';
import { PlaceTabs } from './PlaceTabs';
import { PinLegend } from './PinLegend';
import { StatusBanners } from './StatusBanners';
import { TrustBlock } from './TrustBlock';
import { usePlace } from './usePlace';
import { VerificationBlock } from './VerificationBlock';

const FOCUS_ZOOM = 15;

function PlaceSkeleton() {
  return (
    <div className="flex flex-col gap-4 px-4 lg:px-5" role="status" aria-label="Загрузка">
      <Skeleton className="h-48 rounded-card" />
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-40 rounded-card" />
      <Skeleton className="h-24 rounded-card" />
    </div>
  );
}

/** Infrastructure and tourism take reviews and ratings (ours and other services'). */
const isReviewable = (place: PlaceDetail) =>
  place.layer === 'infrastructure' || place.layer === 'tourism';

/** Things that exist as organisations in other catalogues: sights and named facilities. */
function hasPresenceElsewhere(place: PlaceDetail): boolean {
  if (place.layer === 'tourism') return true;
  if (place.layer !== 'infrastructure') return false;
  return place.external_rating !== null || place.title !== place.category.name;
}

function PlaceBody({ place }: { place: PlaceDetail }) {
  const { location } = useUserLocation();
  const [appealing, setAppealing] = useState(false);
  const layer = LAYER_META[place.layer];
  const compact = hasCompactCard(place);
  const distance = location ? formatDistance(haversine(location.point, place)) : null;

  const startMeetup = () =>
    requireAuth(
      () =>
        openCreatePlace({
          layer: 'event',
          point: { lat: place.lat, lng: place.lng },
          address: place.address ?? undefined,
          venuePlaceId: place.id,
          venueTitle: place.title,
          isMeetup: true,
        }),
      'чтобы создать встречу',
    );

  return (
    <Rise className="flex flex-col gap-4 pb-6">
      {place.area && (
        <div className="flex px-4 pt-0.5 lg:px-5">
          <AreaBreadcrumb area={place.area} />
        </div>
      )}
      <PlaceGallery place={place} />
      <div className="flex flex-col gap-4 px-4 lg:px-5">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-xl leading-tight font-semibold text-ink">{place.title}</h2>
          <p className="flex items-start gap-1.5 text-sm text-ink-soft">
            <MapPin size={15} aria-hidden className="mt-0.5 shrink-0 text-ink-faint" />
            <span>
              {[place.address ?? 'Адрес не указан', distance && `${distance} от вас`]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </p>
          {isReviewable(place) && (
            <RatingSummary
              item={place}
              target={isExternalReviewsTarget(place) ? externalTarget('place', place) : null}
              ownLabel="оценка жителей"
              className="mt-0.5"
            />
          )}
          <TopicChips topics={place.topics} label="О чём это место" className="mt-1" />
        </div>

        <PinLegend place={place} />

        <StatusBanners place={place} onAppeal={() => setAppealing(true)} />
        {place.layer === 'event' && <EventSection place={place} />}
        {place.layer === 'issue' && <IssueSection place={place} />}

        {place.description && (
          <div className="flex flex-col gap-1.5">
            <p className="text-base whitespace-pre-line text-ink">{place.description}</p>
            {place.description_credit && <TextCreditNote credit={place.description_credit} />}
          </div>
        )}

        {!compact && (
          <>
            <TrustBlock place={place} />
            <VerificationBlock place={place} />
          </>
        )}
        <AttributesBlock place={place} />
        {hasPresenceElsewhere(place) && (
          <ElsewhereLinks
            title={place.title}
            point={place}
            twoGisUrl={place.external_rating?.url}
          />
        )}

        {!compact && (
          <div className="flex flex-wrap gap-2">
            <AddPhotosButton place={place} />
            {place.layer === 'infrastructure' && (
              <Button variant="soft" icon={CalendarPlus} onClick={startMeetup}>
                Создать встречу здесь
              </Button>
            )}
          </div>
        )}

        <PlaceTabs place={place} />
        {!compact && (
          <p className={`text-center text-xs ${TONES[place.layer].text}`}>
            Слой «{layer.label}» · {place.category.name}
          </p>
        )}
      </div>
      <AppealDialog open={appealing} onClose={() => setAppealing(false)} placeId={place.id} />
    </Rise>
  );
}

/** The place card for all four layers — shown on top of any panel section via `?place=<id>`. */
export function PlacePanel({ placeId }: { placeId: number }) {
  const { closePlace } = usePlaceParam();
  const { flyTo, ready } = useMapActions();
  const { data: place, isPending, isError, error, refetch } = usePlace(placeId);
  useMapFocusPlace(place);
  useMapUnfoldArea(place?.area?.id);

  const lat = place?.lat;
  const lng = place?.lng;
  useEffect(() => {
    if (ready && lat !== undefined && lng !== undefined)
      flyTo({ lat, lng }, { minZoom: FOCUS_ZOOM });
  }, [ready, lat, lng, flyTo]);

  const notFound = error instanceof ApiError && error.status === 404;

  return (
    <PanelLayout
      title={place?.title ?? (isError ? 'Место недоступно' : 'Загружаем…')}
      subtitle={place && `${place.category.name} · ${LAYER_META[place.layer].label}`}
      onBack={closePlace}
      backLabel="Закрыть карточку"
      actions={place && <PlaceActions place={place} />}
      flush
    >
      {isPending && <PlaceSkeleton />}
      {isError &&
        (notFound ? (
          <EmptyState
            icon={SearchX}
            title="Место не найдено"
            description="Возможно, публикацию скрыли или она ещё на проверке у модератора."
            action={
              <Button variant="secondary" size="sm" onClick={closePlace}>
                Вернуться к карте
              </Button>
            }
          />
        ) : (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ))}
      {place && <PlaceBody place={place} />}
    </PanelLayout>
  );
}
