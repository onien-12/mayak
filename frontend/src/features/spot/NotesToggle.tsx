import { MessageSquareText } from 'lucide-react';

import { Chip, Switch } from '@/shared/ui';

import { useNotesLayer } from './notesLayerStore';

interface NotesToggleProps {
  /** `chip`: pill for the row of filters over the map; `switch`: labelled row in a filters panel. */
  variant?: 'chip' | 'switch';
  className?: string;
}

/** Shows / hides the note bubbles of `NotesMapLayer`. */
export function NotesToggle({ variant = 'chip', className }: NotesToggleProps) {
  const visible = useNotesLayer((state) => state.visible);
  const toggle = useNotesLayer((state) => state.toggle);

  if (variant === 'switch') {
    return (
      <Switch
        checked={visible}
        onChange={toggle}
        label="Заметки жителей"
        description="Пузырьки с заметками при крупном масштабе"
        className={className}
      />
    );
  }

  return (
    <Chip icon={MessageSquareText} selected={visible} onClick={toggle} className={className}>
      Заметки
    </Chip>
  );
}
