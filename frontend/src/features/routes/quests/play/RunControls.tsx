import { FlaskConical, MapPinCheck, Send } from 'lucide-react';
import { useState } from 'react';

import type { QuestCurrentStage, QuestRun } from '@/shared/api';
import { Button, Input } from '@/shared/ui';

interface RunControlsProps {
  run: QuestRun;
  stage: QuestCurrentStage;
  busy: boolean;
  locating: boolean;
  /** Seconds until the pause after wrong tries ends; 0 when the run may try. */
  waitS: number;
  onSubmit: (options: { answer?: string; onSite?: boolean }) => void;
}

/** The thumb-zone action of the stage: «Я на месте», or the code / answer field. */
export function RunControls({ run, stage, busy, locating, waitS, onSubmit }: RunControlsProps) {
  const [answer, setAnswer] = useState('');
  const paused = waitS > 0;
  const testButton = run.can_confirm_on_site && stage.check_arrival;

  if (stage.condition === 'arrival') {
    return (
      <div className="flex flex-col gap-2">
        <Button
          block
          size="lg"
          icon={MapPinCheck}
          loading={busy}
          disabled={paused}
          onClick={() => onSubmit({})}
        >
          {paused ? `Пауза: ещё ${waitS} с` : locating ? 'Определяем, где вы…' : 'Я на месте'}
        </Button>
        {testButton && (
          <Button
            block
            variant="secondary"
            icon={FlaskConical}
            disabled={busy || paused}
            onClick={() => onSubmit({ onSite: true })}
          >
            Я на месте — для проверки, без геолокации
          </Button>
        )}
      </div>
    );
  }

  const label = stage.condition === 'code' ? 'Код с места' : 'Ваш ответ';
  const send = (onSite: boolean) => {
    const text = answer.trim();
    if (text) onSubmit({ answer: text, onSite });
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        send(false);
      }}
      className="flex flex-col gap-2"
    >
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <Input
            value={answer}
            maxLength={100}
            placeholder={label}
            aria-label={label}
            autoCapitalize={stage.condition === 'code' ? 'characters' : 'sentences'}
            autoComplete="off"
            enterKeyHint="send"
            onChange={(event) => setAnswer(event.target.value)}
          />
        </div>
        <Button
          type="submit"
          size="lg"
          icon={Send}
          loading={busy}
          disabled={paused || !answer.trim()}
        >
          {paused ? `${waitS} с` : 'Проверить'}
        </Button>
      </div>
      {testButton && (
        <Button
          variant="secondary"
          icon={FlaskConical}
          disabled={busy || paused || !answer.trim()}
          onClick={() => send(true)}
        >
          Проверить без геолокации (тест)
        </Button>
      )}
    </form>
  );
}
