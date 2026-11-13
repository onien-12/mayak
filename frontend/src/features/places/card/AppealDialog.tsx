import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { errorMessage, placesApi, queryKeys } from '@/shared/api';
import { Banner, Button, Field, Modal, Textarea, toast } from '@/shared/ui';

const MIN_TEXT = 10;

interface AppealDialogProps {
  open: boolean;
  onClose: () => void;
  placeId: number;
}

/** Appeal against a moderator decision — one per decision, author only. */
export function AppealDialog({ open, onClose, placeId }: AppealDialogProps) {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const tooShort = text.trim().length < MIN_TEXT;

  const send = useMutation({
    mutationFn: () => placesApi.appeal(placeId, text.trim()),
    onSuccess: () => {
      toast.success('Апелляция отправлена — модератор рассмотрит её повторно');
      void queryClient.invalidateQueries({ queryKey: queryKeys.places.detail(placeId) });
      setText('');
      onClose();
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Оспорить решение"
      description="Объясните, почему публикацию стоит вернуть. Апелляцию можно подать один раз."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button disabled={tooShort} loading={send.isPending} onClick={() => send.mutate()}>
            Отправить
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {send.isError && <Banner tone="danger">{errorMessage(send.error)}</Banner>}
        <Field label="Ваши доводы" htmlFor="appeal-text" hint={`Не короче ${MIN_TEXT} символов`}>
          <Textarea
            id="appeal-text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={2000}
            rows={4}
            placeholder="Например: место существует, вот свежие фото…"
            data-autofocus
          />
        </Field>
      </div>
    </Modal>
  );
}
