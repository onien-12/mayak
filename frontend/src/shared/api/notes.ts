import { api } from './client';
import type { MapNote, NoteInput, NotesQuery } from './types';

export const notesApi = {
  /** Pass exactly one selector: `bbox`, `object_id` or `near` (+ `radius_m`). */
  list: (query: NotesQuery, signal?: AbortSignal) =>
    api.get<MapNote[]>('/notes', { ...query }, signal),
  create: (input: NoteInput) => api.post<MapNote>('/notes', input),
  remove: (id: number) => api.delete(`/notes/${id}`),
  /** One report per user; three distinct reports hide the note. */
  report: (id: number) => api.post<void>(`/notes/${id}/report`),
};
