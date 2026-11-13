import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { complaintsApi, errorMessage, type ComplaintReason } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import {
  COMPLAINT_REASON_META,
  PLACE_COMPLAINT_REASONS,
  ROUTE_COMPLAINT_REASONS,
} from '@/shared/lib/labels';
import { Banner, Button, Modal, Textarea, toast } from '@/shared/ui';

export interface ComplaintDialogProps {
  open: boolean;
  onClose: () => void;
  /** What the complaint is about; «Маршрут непроходим» is offered for routes only. */
  targetType: 'place' | 'route';
  targetId: number;
}

const REASONS = { place: PLACE_COMPLAINT_REASONS, route: ROUTE_COMPLAINT_REASONS } as const;

/** Complaint about a place or a route: a reason and an optional comment for the moderator. */
export function ComplaintDialog({ open, onClose, targetType, targetId }: ComplaintDialogProps) {
  const [reason, setReason] = useState<ComplaintReason | null>(null);
  const [comment, setComment] = useState('');

  const send = useMutation({
    mutationFn: (selected: ComplaintReason) =>
      complaintsApi.create({
        target_type: targetType,
        target_id: targetId,
        reason: selected,
        comment: comment.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('Жалоба отправлена. Спасибо, что помогаете карте');
      setReason(null);
      setComment('');
      onClose();
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Что не так?"
      description="Жалобу увидят модераторы. Если нарушений нет, она будет отклонена."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button
            variant="danger"
            disabled={!reason}
            loading={send.isPending}
            onClick={() => reason && send.mutate(reason)}
          >
            Пожаловаться
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {send.isError && <Banner tone="danger">{errorMessage(send.error)}</Banner>}
        <div role="radiogroup" aria-label="Причина жалобы" className="flex flex-col gap-1.5">
          {REASONS[targetType].map((item) => {
            const meta = COMPLAINT_REASON_META[item];
            const selected = reason === item;
            return (
              <button
                key={item}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setReason(item)}
                className={cn(
                  'flex min-h-12 items-center gap-3 rounded-control border px-3 py-2 text-left transition-colors duration-150',
                  selected ? 'border-brand bg-brand-soft' : 'border-line hover:border-ink-faint/60',
                )}
              >
                <meta.icon size={18} aria-hidden className="shrink-0 text-ink-soft" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">{meta.label}</span>
                  <span className="block text-xs text-ink-faint">{meta.description}</span>
                </span>
              </button>
            );
          })}
        </div>
        <Textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          maxLength={1000}
          rows={2}
          placeholder="Комментарий для модератора (необязательно)"
          aria-label="Комментарий"
        />
      </div>
    </Modal>
  );
}
