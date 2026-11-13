import { useState, type KeyboardEvent } from 'react';

import { Chip, Input } from '@/shared/ui';

const MAX_TAGS = 8;
const MAX_TAG_LENGTH = 24;

interface TagsInputProps {
  id: string;
  value: readonly string[];
  onChange: (tags: string[]) => void;
}

/** Free-form tags: Enter or a comma adds one; lowercased, up to 8 tags of 24 characters. */
export function TagsInput({ id, value, onChange }: TagsInputProps) {
  const [draft, setDraft] = useState('');
  const full = value.length >= MAX_TAGS;

  const commit = () => {
    const tag = draft.trim().toLowerCase().replace(/^#/, '').slice(0, MAX_TAG_LENGTH);
    if (tag && !value.includes(tag) && !full) onChange([...value, tag]);
    setDraft('');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <Chip
              key={tag}
              selected
              onRemove={() => onChange(value.filter((item) => item !== tag))}
            >
              #{tag}
            </Chip>
          ))}
        </div>
      )}
      <Input
        id={id}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        disabled={full}
        enterKeyHint="done"
        placeholder={full ? 'Максимум 8 тегов' : 'Например: вид на море'}
      />
    </div>
  );
}
