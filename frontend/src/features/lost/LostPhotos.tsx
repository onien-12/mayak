import { useMutation } from '@tanstack/react-query';
import { ImagePlus, X } from 'lucide-react';
import { useRef } from 'react';

import {
  errorMessage,
  UPLOAD_ACCEPT,
  UPLOAD_MAX_BYTES,
  uploadsApi,
  type Photo,
} from '@/shared/api';
import { Spinner, toast } from '@/shared/ui';

export const MAX_LOST_PHOTOS = 3;

interface LostPhotosProps {
  photos: readonly Photo[];
  onChange: (photos: Photo[]) => void;
}

/** Up to three photos of the thing; each one is checked before others see it. */
export function LostPhotos({ photos, onChange }: LostPhotosProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const room = MAX_LOST_PHOTOS - photos.length;
  const upload = useMutation({
    mutationFn: async (files: readonly File[]) => {
      const uploaded: Photo[] = [];
      for (const file of files) {
        if (file.size > UPLOAD_MAX_BYTES) {
          toast.error('Фото больше 8 МБ — выберите файл поменьше');
          continue;
        }
        try {
          uploaded.push(await uploadsApi.upload(file));
        } catch (error) {
          toast.error(errorMessage(error));
        }
      }
      return uploaded;
    },
    onSuccess: (uploaded) => {
      if (uploaded.length > 0) onChange([...photos, ...uploaded]);
    },
  });

  return (
    <div className="grid grid-cols-4 gap-2">
      {photos.map((photo, index) => (
        <div
          key={photo.id}
          className="relative aspect-square overflow-hidden rounded-control bg-canvas"
        >
          <img src={photo.url} alt={`Фото ${index + 1}`} className="size-full object-cover" />
          <button
            type="button"
            aria-label="Убрать фото"
            onClick={() => onChange(photos.filter((item) => item.id !== photo.id))}
            className="tap-target absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-ink/60 text-white"
          >
            <X size={13} aria-hidden />
          </button>
        </div>
      ))}
      {room > 0 && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={upload.isPending}
          className="flex aspect-square flex-col items-center justify-center gap-1 rounded-control border border-dashed border-ink-faint/50 text-xs font-medium text-ink-soft transition-colors hover:border-brand hover:text-brand"
        >
          {upload.isPending ? <Spinner /> : <ImagePlus size={20} aria-hidden />}
          Фото
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={UPLOAD_ACCEPT}
        multiple
        hidden
        onChange={(event) => {
          const files = [...(event.target.files ?? [])].slice(0, room);
          event.target.value = '';
          if (files.length > 0) upload.mutate(files);
        }}
      />
    </div>
  );
}
