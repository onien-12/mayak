import { MapPinPlus } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { TopicChips } from '@/features/interests';
import { externalTarget, ElsewhereLinks, RatingSummary, ReviewFeed } from '@/features/places';
import type { AreaDetail, PlaceCard } from '@/shared/api';
import { EmptyState, OsmCredit, Rise, TextCreditNote } from '@/shared/ui';

import { AreaCover } from './AreaCover';
import { AreaHighlights } from './AreaHighlights';
import { AreaPlaces } from './AreaPlaces';
import { AreaSideSections } from './AreaSections';
import { InterestBlock } from './InterestBlock';

const isInner = (place: PlaceCard) => place.layer === 'infrastructure' || place.layer === 'tourism';

interface AreaBodyProps {
  area: AreaDetail;
  /** Notes of the linked 2GIS object (plugged in by the spot feature). */
  notes?: ReactNode;
}

/** Content of the area card, phone-first: cover, title, interest, what is here, the rest. */
export function AreaBody({ area, notes }: AreaBodyProps) {
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const inner = area.places.filter(isInner);

  return (
    <Rise className="flex flex-col gap-4 pb-6">
      <AreaCover area={area} places={inner} />
      <div className="flex flex-col gap-5 px-4 lg:px-5">
        <RatingSummary
          item={area}
          target={externalTarget('area', area)}
          ownLabel="средняя оценка мест внутри"
          className="-mb-2"
        />
        <TopicChips topics={area.topics} label="О чём эта локация" className="-mt-1" />
        <InterestBlock area={area} />
        <ElsewhereLinks title={area.title} point={area} twoGisUrl={area.external_rating?.url} />

        {area.description && (
          <div className="flex flex-col gap-1.5">
            <p className="text-base whitespace-pre-line text-ink">{area.description}</p>
            {area.description_credit && <TextCreditNote credit={area.description_credit} />}
          </div>
        )}

        {inner.length > 0 ? (
          <div className="flex flex-col gap-4">
            <AreaHighlights
              highlights={area.highlights}
              selectedId={categoryId}
              onSelect={setCategoryId}
            />
            <AreaPlaces places={inner} categoryId={categoryId} />
          </div>
        ) : (
          <EmptyState
            icon={MapPinPlus}
            title="Здесь пока ничего не отмечено"
            description="Знаете беседку, туалет или видовую точку внутри? Добавьте — и локация оживёт."
          />
        )}

        <AreaSideSections places={area.places} />
        <ReviewFeed target={externalTarget('area', area)} title="Отзывы" lazy />
        {notes}

        <p className="pt-2 text-center text-2xs text-ink-faint">
          {area.external?.source === 'osm'
            ? 'Территория из OpenStreetMap'
            : 'Границы: 2ГИС, жители'}{' '}
          · <OsmCredit className="text-2xs" />
        </p>
      </div>
    </Rise>
  );
}
