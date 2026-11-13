import { api } from './client';
import type { Photo } from './types';

export const UPLOAD_MAX_BYTES = 8 * 1024 * 1024;
export const UPLOAD_ACCEPT = 'image/jpeg,image/png,image/webp';

export const uploadsApi = {
  upload: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<Photo>('/uploads', form);
  },
};
