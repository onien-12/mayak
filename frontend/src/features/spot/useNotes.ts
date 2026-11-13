import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { MapTap } from '@/features/map';
import {
  ApiError,
  errorMessage,
  notesApi,
  queryKeys,
  rereadAfterCheck,
  type MapNote,
  type NoteInput,
  type NotesQuery,
  type UserMe,
} from '@/shared/api';
import { toast } from '@/shared/ui';

/** A thread without a 2GIS object is every note within this radius of the point (SPEC §13). */
const THREAD_RADIUS_M = 40;
export const NOTE_MAX_LENGTH = 500;
export const NOTE_FORMS = ['заметка', 'заметки', 'заметок'] as const;

/** Notes of the tapped object, or around the tapped point when there is no object. */
export function spotNotesQuery(spot: MapTap): NotesQuery {
  return spot.objectId
    ? { object_id: spot.objectId }
    : { near: `${spot.lat.toFixed(6)},${spot.lng.toFixed(6)}`, radius_m: THREAD_RADIUS_M };
}

/** Inline message for a failed note: the field message of a 422, else the backend detail. */
export function noteErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.errors[0]?.message ?? error.detail;
  return errorMessage(error);
}

function optimisticNote(input: NoteInput, author: UserMe): MapNote {
  return {
    id: -Date.now(),
    lat: input.lat,
    lng: input.lng,
    text: input.text,
    object_id: input.object_id ?? null,
    object_name: input.object_name ?? null,
    author: {
      id: author.id,
      username: author.username,
      display_name: author.display_name,
      level: author.level,
      role: author.role,
      reputation: author.reputation,
    },
    created_at: new Date().toISOString(),
    can_delete: true,
    reported_by_me: false,
  };
}

/**
 * The notes thread of a spot with optimistic create / delete / report. A freshly sent note
 * keeps its temporary list key after the server answers, so it animates in only once.
 */
export function useSpotNotes(spot: MapTap) {
  const queryClient = useQueryClient();
  const query = spotNotesQuery(spot);
  const key = queryKeys.notes.list(query);
  const [aliases, setAliases] = useState<ReadonlyMap<number, number>>(new Map());

  const notes = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => notesApi.list(query, signal),
  });

  const snapshot = async () => {
    await queryClient.cancelQueries({ queryKey: key });
    return queryClient.getQueryData<MapNote[]>(key);
  };
  const rollback = (previous: MapNote[] | undefined) => {
    if (previous) queryClient.setQueryData(key, previous);
  };
  const refreshLayer = () => queryClient.invalidateQueries({ queryKey: queryKeys.notes.all });

  const create = useMutation({
    mutationFn: notesApi.create,
    onMutate: async (input: NoteInput) => {
      const previous = await snapshot();
      const me = queryClient.getQueryData<UserMe>(queryKeys.auth.me);
      const temp = me ? optimisticNote(input, me) : null;
      if (temp) queryClient.setQueryData<MapNote[]>(key, (list) => [temp, ...(list ?? [])]);
      return { previous, tempId: temp?.id };
    },
    onError: (_error, _input, context) => rollback(context?.previous),
    onSuccess: (note, _input, context) => {
      const tempId = context.tempId;
      queryClient.setQueryData<MapNote[]>(key, (list = []) =>
        tempId === undefined
          ? [note, ...list]
          : list.map((item) => (item.id === tempId ? note : item)),
      );
      if (tempId !== undefined) setAliases((prev) => new Map(prev).set(note.id, tempId));
      void refreshLayer();
      rereadAfterCheck([queryKeys.notes.all]);
    },
  });

  const remove = useMutation({
    mutationFn: (note: MapNote) => notesApi.remove(note.id),
    onMutate: async (note) => {
      const previous = await snapshot();
      queryClient.setQueryData<MapNote[]>(key, (list = []) =>
        list.filter((item) => item.id !== note.id),
      );
      return { previous };
    },
    onError: (error, _note, context) => {
      rollback(context?.previous);
      toast.error(errorMessage(error));
    },
    onSuccess: () => {
      toast.success('Заметка удалена');
      void refreshLayer();
    },
  });

  const report = useMutation({
    mutationFn: (note: MapNote) => notesApi.report(note.id),
    onMutate: async (note) => {
      const previous = await snapshot();
      queryClient.setQueryData<MapNote[]>(key, (list = []) =>
        list.map((item) => (item.id === note.id ? { ...item, reported_by_me: true } : item)),
      );
      return { previous };
    },
    onError: (error, _note, context) => {
      rollback(context?.previous);
      toast.error(errorMessage(error));
    },
    onSuccess: () => toast.success('Спасибо! Модераторы посмотрят на заметку'),
  });

  /** Stable React key: a sent note keeps the key of its optimistic copy. */
  const keyOf = (note: MapNote) => aliases.get(note.id) ?? note.id;

  return { notes, create, remove, report, keyOf };
}

export type SpotNotes = ReturnType<typeof useSpotNotes>;
