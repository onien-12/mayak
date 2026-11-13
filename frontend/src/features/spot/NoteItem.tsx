import { Flag, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';

import type { MapNote } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { formatRelative } from '@/shared/lib/format';
import { IconButton, OnReviewMark, SPRING, TWEEN, UserChip } from '@/shared/ui';

interface NoteItemProps {
  note: MapNote;
  /** The note was written by the current user (no report button). */
  mine: boolean;
  onReport: (note: MapNote) => void;
  onDelete: (note: MapNote) => void;
}

/** One note of the thread: author, relative time, text, report / delete. */
export function NoteItem({ note, mine, onReport, onDelete }: NoteItemProps) {
  const sending = note.id < 0;

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: -10, scale: 0.98 }}
      animate={{ opacity: sending ? 0.7 : 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: TWEEN.fast }}
      transition={SPRING.sheet}
      className="rounded-card bg-canvas p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <UserChip
          user={note.author}
          size="sm"
          caption={sending ? 'Отправляем…' : formatRelative(note.created_at)}
        />
        {!sending && (
          <div className="-my-1 -mr-1 flex shrink-0 items-center">
            {!mine && (
              <IconButton
                icon={Flag}
                size="sm"
                label={note.reported_by_me ? 'Вы уже пожаловались' : 'Пожаловаться на заметку'}
                disabled={note.reported_by_me}
                onClick={() => onReport(note)}
                iconClassName={cn(note.reported_by_me && 'fill-danger text-danger')}
              />
            )}
            {note.can_delete && (
              <IconButton
                icon={Trash2}
                size="sm"
                label="Удалить заметку"
                onClick={() => onDelete(note)}
              />
            )}
          </div>
        )}
      </div>
      <p className="mt-2 text-base [overflow-wrap:anywhere] whitespace-pre-line text-ink">
        {note.text}
      </p>
      {note.reported_by_me && (
        <p className="mt-1.5 text-xs text-ink-faint">Вы пожаловались на эту заметку</p>
      )}
      {note.on_review && <OnReviewMark className="mt-2" />}
    </motion.li>
  );
}
