import { ImagePlus } from 'lucide-react';

import type { PlaceDetail } from '@/shared/api';
import { Button } from '@/shared/ui';

import { useAddPhotos } from './useAddPhotos';

/** «Добавить фото» as a button in the body of the card. */
export function AddPhotosButton({ place }: { place: PlaceDetail }) {
  const photos = useAddPhotos(place);
  if (!photos.canAdd) return null;

  return (
    <>
      <Button variant="secondary" icon={ImagePlus} loading={photos.busy} onClick={photos.pick}>
        Добавить фото
      </Button>
      {photos.input}
    </>
  );
}
