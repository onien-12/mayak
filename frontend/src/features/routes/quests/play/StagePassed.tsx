import { ArrowRight, Flag } from 'lucide-react';

import type { QuestPassedStage } from '@/shared/api';
import { Button, Modal, Rise, SuccessCheck } from '@/shared/ui';

interface StagePassedProps {
  stage: QuestPassedStage | null;
  last: boolean;
  onClose: () => void;
}

/** The moment a stage is found: a check, the name of the place and its story. */
export function StagePassed({ stage, last, onClose }: StagePassedProps) {
  return (
    <Modal
      open={stage !== null}
      onClose={onClose}
      title={stage ? `Этап ${stage.position} пройден!` : ''}
      footer={
        <Button block icon={last ? Flag : ArrowRight} onClick={onClose}>
          {last ? 'К финишу' : 'К следующей загадке'}
        </Button>
      }
    >
      {stage && (
        <div className="flex flex-col items-center gap-3 text-center">
          <SuccessCheck size={72} />
          <Rise delay={0.25} className="flex flex-col gap-2">
            <p className="font-display text-lg font-semibold text-ink">{stage.title}</p>
            {stage.reward && (
              <p className="text-left text-base whitespace-pre-line text-ink">{stage.reward}</p>
            )}
          </Rise>
        </div>
      )}
    </Modal>
  );
}
