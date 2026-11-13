import { FileSearch, Flag } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';

import { ApiError, type ModerationAction, type ModerationCaseDetail } from '@/shared/api';
import { formatRelative, pluralize, PLURALS } from '@/shared/lib/format';
import { MODERATION_ACTION_META } from '@/shared/lib/labels';
import { Button, EmptyState, ErrorState, PageLayout, Rise, Skeleton, toast } from '@/shared/ui';

import { CaseEvidence, ResolutionCard } from './CaseEvidence';
import { AiReviewCard, WhyHere } from './CaseReasons';
import { DecisionBar, DecisionDone } from './DecisionBar';
import { DecisionDialog } from './DecisionDialog';
import { availableActions, HELD_KIND_LABELS } from './moderationMeta';
import { RiskMeter } from './RiskMeter';
import { HiddenSignals, PhotoReviewsCard, ScreeningHoldBanner } from './ScreeningCards';
import { TargetPreview } from './TargetPreview';
import { findNextCase, useCase, useResolveCase, type QueueFilters } from './useModeration';

/** How long the success mark stays before the next case opens, ms. */
const FEEDBACK_MS = 900;
const DEFAULT_QUEUE: QueueFilters = { sort: 'risk' };

function queueFromState(state: unknown): QueueFilters {
  if (state && typeof state === 'object' && 'queue' in state) {
    return { ...(state.queue as QueueFilters), state: 'open' };
  }
  return DEFAULT_QUEUE;
}

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function CaseBody({ detail, queue }: { detail: ModerationCaseDetail; queue: QueueFilters }) {
  const navigate = useNavigate();
  const [choice, setChoice] = useState<ModerationAction | null>(null);
  const [decided, setDecided] = useState<ModerationAction | null>(null);

  const resolve = useResolveCase(detail.id, async ({ action }) => {
    setChoice(null);
    setDecided(action);
    toast.success(`${MODERATION_ACTION_META[action].done}: «${detail.target_title}»`);
    const [next] = await Promise.all([
      findNextCase(detail.id, queue).catch(() => null),
      wait(FEEDBACK_MS),
    ]);
    if (next !== null) {
      navigate(`/moderation/${next}`, { replace: true, state: { queue } });
    } else {
      toast.info('Очередь пуста — отличная работа!');
      navigate('/moderation', { replace: true });
    }
  });

  const open = detail.state === 'open';
  const actions = availableActions(detail);

  return (
    <>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-5">
        <Rise className="flex min-w-0 flex-col gap-3">
          {detail.resolution && (
            <ResolutionCard resolution={detail.resolution} resolvedAt={detail.resolved_at} />
          )}
          {open && <ScreeningHoldBanner detail={detail} />}
          <div className="flex items-center gap-3 rounded-card bg-canvas p-3">
            <RiskMeter risk={detail.risk} size={56} />
            <div className="min-w-0 text-sm text-ink-soft">
              <p className="font-semibold text-ink">Риск {detail.risk} из 100</p>
              <p>Поступило {formatRelative(detail.created_at)}</p>
              {detail.complaints_count > 0 && (
                <p className="flex items-center gap-1 font-medium text-danger-ink">
                  <Flag size={13} aria-hidden />
                  {pluralize(detail.complaints_count, PLURALS.complaint)}
                </p>
              )}
            </div>
          </div>
          <WhyHere detail={detail} />
          {detail.ai_review && <AiReviewCard review={detail.ai_review} />}
          <PhotoReviewsCard reviews={detail.photo_reviews} />
          {detail.target_type === 'place' || detail.target_type === 'route' ? (
            <TargetPreview place={detail.place} route={detail.route} />
          ) : (
            <p className="rounded-card bg-canvas p-4 text-sm text-ink-soft">
              {HELD_KIND_LABELS[detail.target_type]}: такие элементы выпускают или убирают во
              вкладке «Удержано».
            </p>
          )}
        </Rise>
        <Rise delay={0.08} className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-0">
          <HiddenSignals detail={detail} />
          <CaseEvidence detail={detail} />
        </Rise>
      </div>
      {open && actions.length > 0 && (
        <DecisionBar
          actions={actions}
          onChoose={setChoice}
          disabled={resolve.isPending || decided !== null}
        />
      )}
      <DecisionDialog
        action={open ? choice : null}
        loading={resolve.isPending}
        onClose={() => setChoice(null)}
        onConfirm={(reason) => choice && resolve.mutate({ action: choice, reason })}
      />
      {decided && <DecisionDone action={decided} />}
    </>
  );
}

function CaseSkeleton() {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label="Загрузка">
      <Skeleton className="h-20 rounded-card" />
      <Skeleton className="h-40 rounded-card" />
      <Skeleton className="h-72 rounded-card" />
    </div>
  );
}

/**
 * One moderation case (`/moderation/:caseId`): the publication, why it is here, the advisory
 * AI opinion, complaints, votes and history — and a decision bar that moves on to the next
 * open case of the same queue.
 */
export default function CasePage() {
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const parsed = Number(params.caseId);
  const id = Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  const detail = useCase(id);
  const queue = queueFromState(location.state);
  const notFound = id === null || (detail.error instanceof ApiError && detail.error.status === 404);
  const back = () => navigate('/moderation');

  return (
    <PageLayout
      title={id ? `Обращение №${id}` : 'Обращение'}
      subtitle={detail.data?.target_title}
      onBack={back}
      width="lg"
    >
      {notFound ? (
        <EmptyState
          icon={FileSearch}
          title="Обращение не найдено"
          description="Возможно, ссылка устарела."
          action={
            <Button variant="secondary" size="sm" onClick={back}>
              К очереди
            </Button>
          }
        />
      ) : detail.isError ? (
        <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />
      ) : detail.data ? (
        <CaseBody key={detail.data.id} detail={detail.data} queue={queue} />
      ) : (
        <CaseSkeleton />
      )}
    </PageLayout>
  );
}
