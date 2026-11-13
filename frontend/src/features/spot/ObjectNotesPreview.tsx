import { useQuery } from '@tanstack/react-query';
import { ChevronRight, MessagesSquare } from 'lucide-react';

import { useSpotParam } from '@/features/map';
import { notesApi, queryKeys, type NotesQuery } from '@/shared/api';
import { formatRelative, pluralize } from '@/shared/lib/format';
import type { LatLng } from '@/shared/lib/geo';
import { Skeleton } from '@/shared/ui';

import { NOTE_FORMS } from './useNotes';

const PREVIEW_COUNT = 2;

interface ObjectNotesPreviewProps {
  /** The linked 2GIS object whose notes thread is shown. */
  objectId: string;
  /** Where the full thread (the spot sheet) opens. */
  point: LatLng;
}

/**
 * Compact notes of a 2GIS object for other cards (the area card): the newest two and a
 * link to the full thread in the spot sheet, where notes are written.
 */
export function ObjectNotesPreview({ objectId, point }: ObjectNotesPreviewProps) {
  const { openSpot } = useSpotParam();
  const query: NotesQuery = { object_id: objectId };
  const notes = useQuery({
    queryKey: queryKeys.notes.list(query),
    queryFn: ({ signal }) => notesApi.list(query, signal),
  });
  const list = notes.data ?? [];
  const open = () => openSpot({ ...point, objectId });

  if (notes.isError) return null;

  return (
    <section aria-label="Заметки жителей" className="flex flex-col gap-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
        <MessagesSquare size={16} aria-hidden className="text-brand" />
        Заметки жителей
        {list.length > 0 && (
          <span className="font-normal text-ink-faint">{pluralize(list.length, NOTE_FORMS)}</span>
        )}
      </h3>
      {notes.isPending && <Skeleton className="h-16 rounded-card" />}
      {list.slice(0, PREVIEW_COUNT).map((note) => (
        <figure key={note.id} className="rounded-card bg-canvas p-3">
          <blockquote className="line-clamp-3 text-sm [overflow-wrap:anywhere] text-ink">
            {note.text}
          </blockquote>
          <figcaption className="mt-1 text-xs text-ink-faint">
            {note.author.display_name} · {formatRelative(note.created_at)}
          </figcaption>
        </figure>
      ))}
      <button
        type="button"
        onClick={open}
        className="tap-target relative flex items-center gap-1 self-start text-sm font-semibold text-brand underline-offset-4 hover:underline"
      >
        {list.length > 0 ? 'Все заметки и написать свою' : 'Заметок пока нет — написать первую'}
        <ChevronRight size={16} aria-hidden />
      </button>
    </section>
  );
}
