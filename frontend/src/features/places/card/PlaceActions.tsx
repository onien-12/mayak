import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Ellipsis,
  Flag,
  ImagePlus,
  Pencil,
  Scale,
  Share2,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';

import { requireAuth, useAuth } from '@/features/auth';
import { usePlaceParam } from '@/features/map';
import { AddToCollectionButton } from '@/features/saved';
import { errorMessage, placesApi, queryKeys, type PlaceDetail } from '@/shared/api';
import { EXTERNAL_SOURCE_META } from '@/shared/lib/labels';
import {
  ConfirmDialog,
  Dropdown,
  DropdownItem,
  DropdownSeparator,
  HeartButton,
  IconButton,
  toast,
} from '@/shared/ui';

import { openEditPlace } from '../editor/editorStore';
import { AppealDialog } from './AppealDialog';
import { hasCompactCard } from './compactCard';
import { ComplaintDialog } from './ComplaintDialog';
import { TrustDialog } from './TrustDialog';
import { useAddPhotos } from './useAddPhotos';
import { useFavorite } from './usePlace';

type Dialog = 'complaint' | 'appeal' | 'delete' | 'trust' | null;

async function share(place: PlaceDetail): Promise<void> {
  const url = `${window.location.origin}/?place=${place.id}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: place.title, url });
      return;
    }
    await navigator.clipboard.writeText(url);
    toast.success('Ссылка скопирована');
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError')) {
      toast.error('Не получилось поделиться ссылкой');
    }
  }
}

/**
 * Header actions of the card: favorite, and a menu with share / edit / delete / complain /
 * appeal — plus, for events, the source, the trust details and adding photos.
 */
export function PlaceActions({ place }: { place: PlaceDetail }) {
  const { user } = useAuth();
  const { closePlace } = usePlaceParam();
  const queryClient = useQueryClient();
  const favorite = useFavorite(place.id);
  const [dialog, setDialog] = useState<Dialog>(null);
  const own = user?.id === place.author_id;
  const compact = hasCompactCard(place);
  const photos = useAddPhotos(place);
  const source = place.external;

  const remove = useMutation({
    mutationFn: () => placesApi.remove(place.id),
    onSuccess: () => {
      toast.success('Публикация удалена');
      setDialog(null);
      closePlace();
      void queryClient.invalidateQueries({ queryKey: queryKeys.places.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.events.all });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <>
      <AddToCollectionButton place={place} />
      <HeartButton
        active={place.is_favorite}
        labels={{ on: 'Убрать из избранного', off: 'В избранное' }}
        onToggle={() =>
          requireAuth(() => favorite.mutate(!place.is_favorite), 'чтобы сохранить место')
        }
      />
      <Dropdown
        label="Действия с местом"
        trigger={(props) => <IconButton {...props} icon={Ellipsis} label="Ещё" />}
      >
        <DropdownItem icon={Share2} onSelect={() => void share(place)}>
          Поделиться
        </DropdownItem>
        {compact && (
          <>
            {photos.canAdd && (
              <DropdownItem icon={ImagePlus} onSelect={photos.pick} disabled={photos.busy}>
                Добавить фото
              </DropdownItem>
            )}
            <DropdownItem icon={ShieldCheck} onSelect={() => setDialog('trust')}>
              Достоверность
            </DropdownItem>
            {source && (
              <DropdownItem
                icon={EXTERNAL_SOURCE_META[source.source].icon}
                onSelect={() => window.open(source.url, '_blank', 'noopener,noreferrer')}
              >
                Источник: {source.label}
              </DropdownItem>
            )}
          </>
        )}
        {place.can_edit && (
          <>
            <DropdownItem icon={Pencil} onSelect={() => openEditPlace(place.id)}>
              Редактировать
            </DropdownItem>
            <DropdownItem icon={Trash2} onSelect={() => setDialog('delete')} danger>
              Удалить
            </DropdownItem>
          </>
        )}
        {place.can_appeal && (
          <DropdownItem icon={Scale} onSelect={() => setDialog('appeal')}>
            Оспорить решение
          </DropdownItem>
        )}
        {!own && (
          <>
            <DropdownSeparator />
            <DropdownItem
              icon={Flag}
              onSelect={() => requireAuth(() => setDialog('complaint'), 'чтобы пожаловаться')}
            >
              Пожаловаться
            </DropdownItem>
          </>
        )}
      </Dropdown>

      {compact && photos.input}
      {compact && (
        <TrustDialog open={dialog === 'trust'} onClose={() => setDialog(null)} place={place} />
      )}
      <ComplaintDialog
        open={dialog === 'complaint'}
        onClose={() => setDialog(null)}
        targetType="place"
        targetId={place.id}
      />
      <AppealDialog open={dialog === 'appeal'} onClose={() => setDialog(null)} placeId={place.id} />
      <ConfirmDialog
        open={dialog === 'delete'}
        onClose={() => setDialog(null)}
        onConfirm={() => remove.mutate()}
        title="Удалить публикацию?"
        description="Она исчезнет с карты и останется только в архиве. Это действие нельзя отменить."
        confirmLabel="Удалить"
        danger
        loading={remove.isPending}
      />
    </>
  );
}
