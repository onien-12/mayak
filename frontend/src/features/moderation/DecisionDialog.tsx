import { useId, useState } from 'react';

import type { ModerationAction } from '@/shared/api';
import { MODERATION_ACTION_META } from '@/shared/lib/labels';
import { Button, Chip, Field, Modal, Textarea } from '@/shared/ui';

import { QUICK_REASONS, REASON_MAX, REASON_MIN } from './moderationMeta';

const DANGEROUS: readonly ModerationAction[] = ['reject', 'hide'];

interface DecisionDialogProps {
  /** The chosen action; `null` keeps the dialog closed (and mounted for the exit animation). */
  action: ModerationAction | null;
  loading: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

/** Every decision needs a reason: quick presets plus free text (≥ 3 characters). */
export function DecisionDialog({ action, loading, onClose, onConfirm }: DecisionDialogProps) {
  const [reason, setReason] = useState('');
  const [shownAction, setShownAction] = useState(action);
  const fieldId = useId();

  if (action !== null && action !== shownAction) {
    setShownAction(action);
    setReason('');
  }

  const current = action ?? shownAction;
  if (!current) return null;
  const meta = MODERATION_ACTION_META[current];
  const trimmed = reason.trim();
  const valid = trimmed.length >= REASON_MIN;

  return (
    <Modal
      open={action !== null}
      onClose={onClose}
      title={meta.label}
      description={meta.description}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Отмена
          </Button>
          <Button
            variant={DANGEROUS.includes(current) ? 'danger' : 'primary'}
            icon={meta.icon}
            loading={loading}
            disabled={!valid}
            onClick={() => onConfirm(trimmed)}
          >
            {meta.label}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2" aria-label="Быстрые причины">
          {QUICK_REASONS[current].map((preset) => (
            <Chip
              key={preset}
              tone={meta.tone}
              selected={trimmed === preset}
              onClick={() => setReason(preset)}
              className="h-auto min-h-10 py-2 whitespace-normal"
            >
              {preset}
            </Chip>
          ))}
        </div>
        <Field
          label={
            current === 'release'
              ? 'Причина — её увидит только журнал'
              : 'Причина — её увидит автор и журнал'
          }
          htmlFor={fieldId}
          hint={`${trimmed.length}/${REASON_MAX} · минимум ${REASON_MIN} символа`}
        >
          <Textarea
            id={fieldId}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={REASON_MAX}
            rows={3}
            placeholder="Коротко объясните решение"
            data-autofocus
          />
        </Field>
      </div>
    </Modal>
  );
}
