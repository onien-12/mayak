import { useState } from 'react';

import type { PlaceDetail } from '@/shared/api';
import { Tabs } from '@/shared/ui';

import { CommentsTab } from './CommentsTab';
import { HistoryTab } from './HistoryTab';
import { ReviewsTab } from './ReviewsTab';

type TabKey = 'reviews' | 'comments' | 'history';

/** Reviews (infrastructure / tourism only), discussion and history. */
export function PlaceTabs({ place }: { place: PlaceDetail }) {
  const reviewable = place.layer === 'infrastructure' || place.layer === 'tourism';
  const [tab, setTab] = useState<TabKey>(reviewable ? 'reviews' : 'comments');

  const tabs = [
    ...(reviewable
      ? [{ value: 'reviews' as const, label: 'Отзывы', count: place.rating_count }]
      : []),
    { value: 'comments' as const, label: 'Обсуждение', count: place.comments_count },
    { value: 'history' as const, label: 'История' },
  ];

  return (
    <section>
      <Tabs label="Отзывы, обсуждение и история" value={tab} onChange={setTab} tabs={tabs} />
      <div role="tabpanel" className="pt-4">
        {tab === 'reviews' && <ReviewsTab place={place} />}
        {tab === 'comments' && <CommentsTab place={place} />}
        {tab === 'history' && <HistoryTab placeId={place.id} />}
      </div>
    </section>
  );
}
