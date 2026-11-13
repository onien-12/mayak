import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

import { requireAuth } from '@/features/auth';
import {
  errorMessage,
  placesApi,
  queryKeys,
  rereadAfterCheck,
  UPLOAD_ACCEPT,
  type PlaceDetail,
} from '@/shared/api';
import { toast } from '@/shared/ui';

import { usePhotoUpload } from './usePhotoUpload';
import { syncPlace } from './usePlace';

const MAX_PHOTOS = 12;

/**
 * Adding photos to a place (anyone, up to 12 per place): `pick` opens the file dialog,
 * `input` is the hidden field to render next to whatever triggers it.
 */
export function useAddPhotos(place: PlaceDetail) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = usePhotoUpload();
  const attach = useMutation({
    mutationFn: (photoIds: number[]) => placesApi.addPhotos(place.id, photoIds),
    onSuccess: (updated) => {
      syncPlace(queryClient, updated);
      rereadAfterCheck([queryKeys.places.detail(place.id)]);
      toast.success('Фото добавлены');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const room = MAX_PHOTOS - place.photos.length;

  const onFiles = async (files: File[]) => {
    const photos = await upload.mutateAsync(files.slice(0, room));
    if (photos.length > 0) attach.mutate(photos.map((photo) => photo.id));
  };

  return {
    canAdd: room > 0,
    busy: upload.isPending || attach.isPending,
    pick: () => requireAuth(() => inputRef.current?.click(), 'чтобы добавить фото'),
    input: (
      <input
        ref={inputRef}
        type="file"
        accept={UPLOAD_ACCEPT}
        multiple
        hidden
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = '';
          if (files.length > 0) void onFiles(files);
        }}
      />
    ),
  };
}
