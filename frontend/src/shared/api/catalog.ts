import { api } from './client';
import type { Category, Layer } from './types';

export const catalogApi = {
  categories: (layer?: Layer) => api.get<Category[]>('/categories', { layer }),
};
