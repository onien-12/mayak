import { useMutation } from '@tanstack/react-query';

import { ApiError, errorMessage, UPLOAD_MAX_BYTES, uploadsApi, type Photo } from '@/shared/api';
import { toast } from '@/shared/ui';

const TOO_LARGE = 'Фото больше 8 МБ — выберите файл поменьше';

/** Uploads image files one by one; failures are reported, successful uploads are returned. */
export function usePhotoUpload() {
  return useMutation({
    mutationFn: async (files: readonly File[]): Promise<Photo[]> => {
      const uploaded: Photo[] = [];
      for (const file of files) {
        if (file.size > UPLOAD_MAX_BYTES) {
          toast.error(TOO_LARGE);
          continue;
        }
        try {
          uploaded.push(await uploadsApi.upload(file));
        } catch (error) {
          toast.error(
            error instanceof ApiError ? errorMessage(error) : 'Не удалось загрузить фото',
          );
        }
      }
      return uploaded;
    },
  });
}
