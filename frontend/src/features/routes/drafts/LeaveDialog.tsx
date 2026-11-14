import { useEffect } from 'react';
import type { Blocker } from 'react-router';

import { ConfirmDialog } from '@/shared/ui';

interface LeaveDialogProps {
  blocker: Blocker;
  /** Writes the draft to this device at once (the last keystrokes included). */
  flush: () => void;
  /** The device refused to store the draft. */
  failed: boolean;
  /** «Выйти из конструктора?» / «Выйти из редактора квеста?» */
  title: string;
}

/**
 * Leaving a builder with unsaved changes. When the device has the draft the dialog only says
 * where to find it; a real warning is left for the case when nothing could be stored.
 */
export function LeaveDialog({ blocker, flush, failed, title }: LeaveDialogProps) {
  const blocked = blocker.state === 'blocked';

  useEffect(() => {
    if (blocked) flush();
  }, [blocked, flush]);

  return (
    <ConfirmDialog
      open={blocked}
      onClose={() => blocker.reset?.()}
      onConfirm={() => blocker.proceed?.()}
      title={failed ? 'Изменения не сохранятся' : title}
      description={
        failed
          ? 'Записать черновик на этом устройстве не получилось. Сохраните его в аккаунт или останьтесь.'
          : 'Черновик сохранён на этом устройстве — вернуться к нему можно в разделе «Маршруты».'
      }
      confirmLabel={failed ? 'Выйти без сохранения' : 'Выйти'}
      cancelLabel="Остаться"
      danger={failed}
    />
  );
}
