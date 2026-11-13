import { useQueryClient } from '@tanstack/react-query';
import { ChevronRight, EyeOff, Flag, Route as RouteIcon } from 'lucide-react';
import { Link } from 'react-router';

import { moderationApi, queryKeys, type AiVerdict, type ModerationCase } from '@/shared/api';
import { formatRelative, pluralize, PLURALS } from '@/shared/lib/format';
import {
  AI_VERDICT_META,
  MODERATION_ACTION_META,
  MODERATION_TRIGGER_META,
} from '@/shared/lib/labels';
import { Badge, LayerIcon, UserChip } from '@/shared/ui';

import { RiskMeter } from './RiskMeter';
import type { QueueFilters } from './useModeration';

/** AI verdict chip of a queue row (advisory LLM pre-screening). */
function AiVerdictChip({ verdict }: { verdict: AiVerdict | null }) {
  if (!verdict) return null;
  const meta = AI_VERDICT_META[verdict];
  return (
    <Badge tone={meta.tone} icon={meta.icon}>
      ИИ: {meta.label.toLowerCase()}
    </Badge>
  );
}

interface CaseRowProps {
  item: ModerationCase;
  /** Queue the row belongs to — the case page continues with the next case of it. */
  filters: QueueFilters;
}

/** Queue row: risk ring, target, author with level, triggers, complaints and age. */
export function CaseRow({ item, filters }: CaseRowProps) {
  const queryClient = useQueryClient();
  const prefetch = () =>
    void queryClient.prefetchQuery({
      queryKey: queryKeys.moderation.case(item.id),
      queryFn: () => moderationApi.case(item.id),
    });
  const resolution = item.resolution;

  return (
    <Link
      to={`/moderation/${item.id}`}
      state={{ queue: filters }}
      onPointerDown={prefetch}
      onFocus={prefetch}
      className="group flex gap-3 rounded-card border border-line/70 bg-surface p-3 transition-[border-color,box-shadow,transform] hover:border-ink-faint/50 hover:shadow-card active:scale-[0.99] lg:p-4"
    >
      <RiskMeter risk={item.risk} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="flex items-start gap-2">
          {item.layer ? (
            <LayerIcon layer={item.layer} size={22} className="mt-px" />
          ) : (
            <span className="mt-px flex size-[22px] shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand">
              <RouteIcon size={13} aria-hidden />
            </span>
          )}
          <span className="line-clamp-2 text-base leading-tight font-semibold text-ink">
            {item.target_title}
          </span>
        </p>
        <UserChip user={item.author} size="sm" linked={false} />
        <div className="flex flex-wrap gap-1">
          {item.triggers.map((trigger) => {
            const meta = MODERATION_TRIGGER_META[trigger];
            return (
              <Badge key={trigger} tone={meta.tone} icon={meta.icon}>
                {meta.label}
              </Badge>
            );
          })}
          {item.quiet && item.state === 'open' && (
            <Badge tone="warning" icon={EyeOff} variant="outline">
              Не прошло автопроверку
            </Badge>
          )}
          <AiVerdictChip verdict={item.ai_verdict} />
          {resolution && (
            <Badge
              tone={MODERATION_ACTION_META[resolution.action].tone}
              icon={MODERATION_ACTION_META[resolution.action].icon}
              variant="outline"
            >
              {MODERATION_ACTION_META[resolution.action].done}
            </Badge>
          )}
        </div>
        <p className="flex flex-wrap items-center gap-x-3 text-xs text-ink-soft">
          {item.complaints_count > 0 && (
            <span className="flex items-center gap-1 font-medium text-danger-ink">
              <Flag size={12} aria-hidden />
              {pluralize(item.complaints_count, PLURALS.complaint)}
            </span>
          )}
          <span>{formatRelative(item.resolved_at ?? item.created_at)}</span>
        </p>
      </div>
      <ChevronRight
        size={18}
        aria-hidden
        className="shrink-0 self-center text-ink-faint transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  );
}
