import { useState } from 'react';

import type { ViewerPhoto } from '@/shared/ui';

/** Hot-linked photos minus the ones that failed to load — a broken image just drops out. */
export function useWorkingPhotos(photos: readonly ViewerPhoto[]) {
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  return {
    visible: photos.filter((photo) => !failed.has(photo.url)),
    drop: (url: string) => setFailed((current) => new Set(current).add(url)),
  };
}
