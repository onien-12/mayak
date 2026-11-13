import { MessagesSquare } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { useState } from 'react';

import { requireAuth, useAuth } from '@/features/auth';
import type { MapNote } from '@/shared/api';
import { pluralize } from '@/shared/lib/format';
import { ConfirmDialog, EmptyState, ErrorState, Skeleton } from '@/shared/ui';

import { NoteItem } from './NoteItem';
import { NOTE_FORMS, type SpotNotes } from './useNotes';

interface NotesThreadProps {
  thread: SpotNotes;
  onWrite: () => void;
}

/** «Заметки»: public notes of this object / point, newest first. */
export function NotesThread({ thread, onWrite }: NotesThreadProps) {
  const { user } = useAuth();
  const { notes, remove, report, keyOf } = thread;
  const [reporting, setReporting] = useState<MapNote | null>(null);
  const [deleting, setDeleting] = useState<MapNote | null>(null);
  const count = notes.data?.filter((note) => note.id > 0).length ?? 0;

  return (
    <section aria-labelledby="spot-notes" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="spot-notes" className="font-display text-base font-semibold text-ink">
          Заметки
        </h2>
        {count > 0 && <span className="text-sm text-ink-soft">{pluralize(count, NOTE_FORMS)}</span>}
      </div>

      {notes.isPending && <Skeleton className="h-24 rounded-card" />}
      {notes.isError && <ErrorState error={notes.error} onRetry={() => void notes.refetch()} />}
      {notes.data?.length === 0 && (
        <EmptyState
          icon={MessagesSquare}
          title="Здесь ещё никто не писал"
          description="Подскажите другим: где вход, что работает, на что обратить внимание."
          className="rounded-card bg-canvas py-6"
          action={
            <button
              type="button"
              onClick={onWrite}
              className="tap-target relative text-sm font-semibold text-brand underline-offset-4 hover:underline"
            >
              Написать первую заметку
            </button>
          }
        />
      )}
      {notes.data && notes.data.length > 0 && (
        <ul className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {notes.data.map((note) => (
              <NoteItem
                key={keyOf(note)}
                note={note}
                mine={user?.id === note.author.id}
                onReport={(target) => requireAuth(() => setReporting(target), 'чтобы пожаловаться')}
                onDelete={setDeleting}
              />
            ))}
          </AnimatePresence>
        </ul>
      )}

      <ConfirmDialog
        open={reporting !== null}
        onClose={() => setReporting(null)}
        onConfirm={() => {
          if (reporting) report.mutate(reporting);
          setReporting(null);
        }}
        title="Пожаловаться на заметку?"
        description="Если на заметку пожалуются три разных жителя, она скроется автоматически. Жалуйтесь на спам, оскорбления и неправду."
        confirmLabel="Пожаловаться"
        danger
      />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting);
          setDeleting(null);
        }}
        title="Удалить заметку?"
        description="Её больше никто не увидит. Отменить удаление нельзя."
        confirmLabel="Удалить"
        danger
      />
    </section>
  );
}
