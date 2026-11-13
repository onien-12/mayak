import { ImagePlus, X } from 'lucide-react';
import { useRef, useState } from 'react';

import { UPLOAD_ACCEPT, type Photo } from '@/shared/api';
import { Lightbox, Spinner } from '@/shared/ui';

import { usePhotoUpload } from '../card/usePhotoUpload';

const MAX_PHOTOS = 8;

interface PhotoPickerProps {
  photos: readonly Photo[];
  onChange: (photos: Photo[]) => void;
  /** Maximum number of photos (default 8 — the place limit). */
  max?: number;
}

/** Thumbnails of attached photos with an upload tile (JPEG / PNG / WebP, up to `max`). */
export function PhotoPicker({ photos, onChange, max = MAX_PHOTOS }: PhotoPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const upload = usePhotoUpload();
  const room = max - photos.length;

  const onFiles = async (files: File[]) => {
    const uploaded = await upload.mutateAsync(files.slice(0, room));
    if (uploaded.length > 0) onChange([...photos, ...uploaded]);
  };

  return (
    <div className="grid grid-cols-4 gap-2">
      {photos.map((photo, index) => (
        <div
          key={photo.id}
          className="relative aspect-square overflow-hidden rounded-control bg-canvas"
        >
          <button
            type="button"
            onClick={() => setViewing(index)}
            aria-label={`Посмотреть фото ${index + 1}`}
            className="block size-full"
          >
            <img src={photo.url} alt="" className="size-full object-cover" />
          </button>
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
          className="flex aspect-square flex-col items-center justify-center gap-1 rounded-control border border-dashed border-ink-faint/50 text-xs font-medium text-ink-soft transition-colors hover:border-brand hover:text-brand active:scale-[0.97]"
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
          const files = [...(event.target.files ?? [])];
          event.target.value = '';
          if (files.length > 0) void onFiles(files);
        }}
      />
      <Lightbox photos={photos} index={viewing} onIndexChange={setViewing} alt="Ваши фото" />
    </div>
  );
}
