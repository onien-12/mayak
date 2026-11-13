import { Globe, Lock, SearchX } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';

import { useMapPlaces } from '@/features/map';
import { ApiError, type CollectionDetail } from '@/shared/api';
import { formatDate, pluralize, PLURALS } from '@/shared/lib/format';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  ListSkeleton,
  PanelLayout,
  Rise,
  Skeleton,
  UserChip,
} from '@/shared/ui';

import { CollectionActions } from './CollectionActions';
import { CollectionCover } from './CollectionCover';
import { CollectionPlaces } from './CollectionPlaces';
import { useCollection } from './useCollections';
import { useFitPlaces } from './useFitPlaces';

const NOT_FOUND = 404;

function CollectionHeader({ collection }: { collection: CollectionDetail }) {
  return (
    <Rise className="mb-4 flex flex-col gap-3">
      <div className="flex gap-3">
        <CollectionCover
          collection={collection}
          className="size-20 shrink-0 overflow-hidden rounded-card"
        />
        <div className="flex min-w-0 flex-col justify-center gap-1.5">
          <UserChip
            user={collection.owner}
            size="sm"
            caption={`с ${formatDate(collection.created_at)}`}
          />
          <div className="flex flex-wrap gap-1.5">
            {collection.is_public ? (
              <Badge tone="success" icon={Globe}>
                Видна всем
              </Badge>
            ) : (
              <Badge icon={Lock}>Только для вас</Badge>
            )}
            <Badge tone="brand">{pluralize(collection.items_count, PLURALS.place)}</Badge>
          </div>
        </div>
      </div>
      {collection.description && (
        <p className="text-sm whitespace-pre-line text-ink-soft">{collection.description}</p>
      )}
    </Rise>
  );
}

/** `/collections/:id` — a collection: its places in a list and all of them on the map. */
export default function CollectionPage() {
  const navigate = useNavigate();
  const id = Number(useParams().id);
  const collection = useCollection(id);
  const back = () => navigate('/saved?tab=collections');
  useMapPlaces(collection.data?.places);
  useFitPlaces(id, collection.data?.places);

  if (collection.isError || !Number.isInteger(id)) {
    const missing = collection.error instanceof ApiError && collection.error.status === NOT_FOUND;
    return (
      <PanelLayout title="Подборка" onBack={back}>
        {missing || !Number.isInteger(id) ? (
          <EmptyState
            icon={SearchX}
            title="Подборка недоступна"
            description="Её удалили или автор сделал её личной."
            action={
              <Button variant="secondary" size="sm" onClick={back}>
                К подборкам
              </Button>
            }
          />
        ) : (
          <ErrorState error={collection.error} onRetry={() => void collection.refetch()} />
        )}
      </PanelLayout>
    );
  }

  if (!collection.data) {
    return (
      <PanelLayout title={<Skeleton className="h-5 w-48" />} onBack={back}>
        <div className="mb-4 flex gap-3">
          <Skeleton className="size-20 rounded-card" />
          <div className="flex flex-1 flex-col justify-center gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-5 w-1/2 rounded-full" />
          </div>
        </div>
        <ListSkeleton rows={4} />
      </PanelLayout>
    );
  }

  return (
    <PanelLayout
      title={collection.data.title}
      subtitle={`Подборка · ${pluralize(collection.data.items_count, PLURALS.place)}`}
      onBack={back}
      backLabel="К подборкам"
      actions={<CollectionActions collection={collection.data} />}
    >
      <CollectionHeader collection={collection.data} />
      <CollectionPlaces collection={collection.data} />
    </PanelLayout>
  );
}
