import { useQuery } from '@tanstack/react-query';
import { MapPinPlus, MapPinned } from 'lucide-react';
import { useNavigate } from 'react-router';

import { requireAuth } from '@/features/auth';
import { openCreatePlace, PlaceListItem } from '@/features/places';
import { queryKeys, usersApi } from '@/shared/api';
import { Button, EmptyState, ErrorState, ListSkeleton, StaggerItem } from '@/shared/ui';

/** The user's publications; the owner also sees pending / hidden ones with their status. */
export function PlacesTab({ userId, own }: { userId: number; own: boolean }) {
  const navigate = useNavigate();
  const places = useQuery({
    queryKey: queryKeys.users.places(userId),
    queryFn: () => usersApi.places(userId),
  });

  const addPlace = () =>
    requireAuth(() => {
      navigate('/');
      openCreatePlace();
    }, 'чтобы добавить место');

  if (places.isPending) return <ListSkeleton rows={3} />;
  if (places.isError)
    return <ErrorState error={places.error} onRetry={() => void places.refetch()} />;
  if (places.data.length === 0) {
    return own ? (
      <EmptyState
        icon={MapPinPlus}
        title="Вы ещё ничего не добавили"
        description="Отметьте туалет, пандус или любимую видовую точку — это первые баллы репутации."
        action={
          <Button icon={MapPinPlus} onClick={addPlace}>
            Добавить место
          </Button>
        }
      />
    ) : (
      <EmptyState
        icon={MapPinned}
        title="Публикаций пока нет"
        description="Житель ещё не добавлял места на карту."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {places.data.map((place, index) => (
        <StaggerItem key={place.id} index={index}>
          <PlaceListItem place={place} onSelect={() => navigate(`/?place=${place.id}`)} />
        </StaggerItem>
      ))}
    </ul>
  );
}
