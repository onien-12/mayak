import { Play, RotateCcw } from 'lucide-react';

import { Button, Modal } from '@/shared/ui';
import { savedAgo } from './summaries';

export interface StartNewChoice {
  open: boolean;
  /** «Без названия · 3 точки». */
  summary: string;
  savedAt: string;
  onContinue: () => void;
  onFresh: () => void;
  onClose: () => void;
}

/** «Создать» while an unfinished new draft is on this device: never drop or reuse it silently. */
export function StartNewDialog({
  open,
  summary,
  savedAt,
  onContinue,
  onFresh,
  onClose,
}: StartNewChoice) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Есть начатый черновик"
      description={`${summary} · сохранён ${savedAgo(savedAt)} на этом устройстве. Продолжить его или начать заново? Начатый черновик тогда удалится.`}
      footer={
        <>
          <Button variant="secondary" icon={RotateCcw} onClick={onFresh}>
            Начать заново
          </Button>
          <Button icon={Play} onClick={onContinue}>
            Продолжить черновик
          </Button>
        </>
      }
    >
      {null}
    </Modal>
  );
}
