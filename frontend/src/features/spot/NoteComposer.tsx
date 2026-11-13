import { Globe, SendHorizontal } from 'lucide-react';
import { useState, type Ref } from 'react';

import { requireAuth } from '@/features/auth';
import type { MapTap } from '@/features/map';
import { cn } from '@/shared/lib/cn';
import { IconButton, Textarea } from '@/shared/ui';

import { NOTE_MAX_LENGTH, noteErrorMessage, type SpotNotes } from './useNotes';

/** The counter turns amber this close to the limit. */
const COUNTER_WARN = 450;

interface NoteComposerProps {
  spot: MapTap;
  /** Object name / address stored with the note. */
  objectName: string | null;
  create: SpotNotes['create'];
  inputRef: Ref<HTMLTextAreaElement>;
}

/** Composer pinned in the thumb zone: text ≤ 500, optimistic send, inline 422 / 429 errors. */
export function NoteComposer({ spot, objectName, create, inputRef }: NoteComposerProps) {
  const [text, setText] = useState('');
  const trimmed = text.trim();
  const error = create.isError ? noteErrorMessage(create.error) : null;

  const send = () => {
    if (!trimmed) return;
    requireAuth(() => {
      setText('');
      create.mutate(
        {
          lat: spot.lat,
          lng: spot.lng,
          text: trimmed,
          object_id: spot.objectId,
          object_name: objectName ?? undefined,
        },
        { onError: () => setText(trimmed) },
      );
    }, 'чтобы оставить заметку');
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
      className="flex flex-col gap-1.5"
    >
      {error && (
        <p
          role="alert"
          className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger-ink"
        >
          {error}
        </p>
      )}
      <div className="flex items-end gap-2">
        <Textarea
          ref={inputRef}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            if (create.isError) create.reset();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) send();
          }}
          maxLength={NOTE_MAX_LENGTH}
          rows={1}
          placeholder="Заметка об этом месте"
          aria-label="Текст заметки"
          invalid={error !== null}
          className="[field-sizing:content] max-h-32 min-h-12 resize-none lg:min-h-11"
        />
        <IconButton
          type="submit"
          icon={SendHorizontal}
          label="Опубликовать заметку"
          variant="solid"
          size="lg"
          className="size-12 lg:size-11"
          disabled={!trimmed}
        />
      </div>
      <div className="flex items-center justify-between gap-2 px-0.5 text-xs text-ink-faint">
        <span className="flex items-center gap-1">
          <Globe size={12} aria-hidden />
          Заметки видят все — не пишите личных данных
        </span>
        <span
          aria-live="polite"
          className={cn(
            'shrink-0 tabular-nums',
            text.length >= COUNTER_WARN && 'font-semibold text-warning-ink',
          )}
        >
          {text.length}/{NOTE_MAX_LENGTH}
        </span>
      </div>
    </form>
  );
}
