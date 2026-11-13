import { useState } from 'react';

import type { TopicSlug } from '@/shared/api';
import { Button, Modal } from '@/shared/ui';

import { InterestPicker, PickerProgress } from './InterestPicker';

interface InterestsDialogProps {
  open: boolean;
  /** Close without saving (✕, backdrop, flick down). */
  onClose: () => void;
  /** Preselected topics. Read when the dialog mounts — key the dialog to reset it. */
  initial: readonly TopicSlug[];
  /** «Готово» with the selection; «Пропустить» calls `onSkip`. */
  onSave: (topics: TopicSlug[]) => void;
  onSkip: () => void;
  /** «Пропустить» by default; «Отмена» where the person came to edit. */
  skipLabel?: string;
  saving?: boolean;
  description?: string;
}

/**
 * «Что вам интересно?» — the topic picker as a dialog (a bottom sheet on phones, with
 * «Пропустить» and «Готово» in the thumb zone). Three topics are recommended, none required.
 */
export function InterestsDialog({
  open,
  onClose,
  initial,
  onSave,
  onSkip,
  skipLabel = 'Пропустить',
  saving = false,
  description = 'Отметьте, что вам по душе, — покажем это первым на карте и в афише. Изменить можно в профиле.',
}: InterestsDialogProps) {
  const [selected, setSelected] = useState<TopicSlug[]>(() => [...initial]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Что вам интересно?"
      description={description}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onSkip} disabled={saving}>
            {skipLabel}
          </Button>
          <Button size="lg" loading={saving} onClick={() => onSave(selected)}>
            Готово
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <PickerProgress count={selected.length} />
        <InterestPicker value={selected} onChange={setSelected} />
      </div>
    </Modal>
  );
}
