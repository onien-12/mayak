import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Ban, Timer } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import { queryKeys, type QuestPassedStage, type QuestRun } from '@/shared/api';
import { Banner, Button, PanelLayout, SPRING, usePanelStore } from '@/shared/ui';

import { formatResult, MAX_TRIES } from '../lib/meta';
import { PassedStages } from './PassedStages';
import { RiddleCard } from './RiddleCard';
import { RunControls } from './RunControls';
import { RunFinish } from './RunFinish';
import { RunMapLayer } from './RunMapLayer';
import { RunMenu } from './RunMenu';
import { StagePassed } from './StagePassed';
import { TeamPanel } from './TeamPanel';
import { useRunActions } from './useRunActions';
import { secondsUntil, useNow } from './useTicker';

function Progress({ run, now }: { run: QuestRun; now: number }) {
  const done = run.passed.length / Math.max(1, run.stages_total);
  const elapsed = Math.round((now - new Date(run.started_at).getTime()) / 1000);
  return (
    <div className="flex items-center gap-3">
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-canvas"
        role="progressbar"
        aria-label="Пройдено этапов"
        aria-valuenow={run.passed.length}
        aria-valuemin={0}
        aria-valuemax={run.stages_total}
      >
        <motion.div
          className="h-full origin-left rounded-full bg-event"
          initial={false}
          animate={{ scaleX: done }}
          transition={SPRING.soft}
        />
      </div>
      {run.current && (
        <span className="flex items-center gap-1 text-xs font-medium text-ink-soft tabular-nums">
          <Timer size={13} aria-hidden />
          {formatResult(elapsed)}
          {run.penalty_min > 0 && <span className="text-warning-ink">+{run.penalty_min} мин</span>}
        </span>
      )}
    </div>
  );
}

/**
 * One run of a quest: the riddle of the current stage (or who holds it in a team), the check
 * on the server, the hint with its penalty, the places found, the team, the finish. A team run
 * is polled, so a stage passed by a teammate opens here too — with its story.
 */
export function RunView({ run, viewerId }: { run: QuestRun; viewerId: number }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [story, setStory] = useState<QuestPassedStage | null>(null);
  const seen = useRef(run.passed.length);
  const actions = useRunActions(run);
  const stage = run.current;
  const now = useNow(stage !== null);
  const waitS = secondsUntil(stage?.locked_until ?? null, now);

  useEffect(() => {
    if (run.passed.length > seen.current) setStory(run.passed.at(-1) ?? null);
    seen.current = run.passed.length;
  }, [run.passed]);

  // A new riddle (or the finish) is worth reading: lift the phone sheet off its lowest snap.
  const reveal = usePanelStore((state) => state.reveal);
  const position = stage?.position ?? 0;
  useEffect(() => {
    reveal();
  }, [reveal, position, run.finished]);

  // The pause after wrong tries is over: read the tries left again.
  const pauseOver = Boolean(stage?.locked_until) && waitS === 0;
  useEffect(() => {
    if (pauseOver) void queryClient.invalidateQueries({ queryKey: queryKeys.quests.run(run.id) });
  }, [pauseOver, queryClient, run.id]);

  const title = stage
    ? `Этап ${run.stage_number} из ${run.stages_total}`
    : run.finished
      ? 'Финиш'
      : 'Прохождение завершено';

  return (
    <>
      <RunMapLayer run={run} />
      <PanelLayout
        title={title}
        subtitle={`${run.quest_title}${run.is_test ? ' · проверка автора' : ''}`}
        onBack={() => navigate(`/quests/${run.quest_id}`)}
        backLabel="К квесту"
        actions={<RunMenu run={run} viewerId={viewerId} />}
        toolbar={<Progress run={run} now={now} />}
        footer={
          stage ? (
            <RunControls
              key={stage.position}
              run={run}
              stage={stage}
              busy={actions.busy}
              locating={actions.locating}
              waitS={waitS}
              onSubmit={(options) => void actions.submit(options)}
            />
          ) : (
            <Button
              block
              size="lg"
              variant="secondary"
              icon={ArrowLeft}
              onClick={() => navigate(`/quests/${run.quest_id}`)}
            >
              К квесту
            </Button>
          )
        }
      >
        <div className="flex flex-col gap-5">
          {run.abandoned && (
            <Banner tone="neutral" icon={Ban} title="Прохождение завершено досрочно">
              Начать заново можно со страницы квеста.
            </Banner>
          )}
          {run.finished && <RunFinish run={run} />}
          {stage && (
            <RiddleCard
              run={run}
              stage={stage}
              onTakeHint={() => actions.hint.mutate()}
              takingHint={actions.hint.isPending}
            />
          )}
          {stage && !pauseOver && stage.tries_left < MAX_TRIES && waitS === 0 && (
            <p className="text-sm text-ink-soft">
              Осталось попыток до минутной паузы: {stage.tries_left}
            </p>
          )}
          {run.is_team && (
            <TeamPanel
              run={run}
              viewerId={viewerId}
              onHandLead={(userId) => actions.lead.mutate(userId)}
              handing={actions.lead.isPending}
            />
          )}
          <PassedStages stages={run.passed} />
        </div>
      </PanelLayout>
      <StagePassed
        stage={story}
        last={run.finished && story?.position === run.stages_total}
        onClose={() => setStory(null)}
      />
    </>
  );
}
