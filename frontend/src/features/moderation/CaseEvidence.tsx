import { ArrowRight, Gavel, Quote } from 'lucide-react';
import { motion } from 'motion/react';

import type {
  ClarificationItem,
  ComplaintItem,
  HistoryEntry,
  ModerationCaseDetail,
  ModerationResolution,
  PlaceDetail,
  UserBrief,
} from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { formatDateTime, formatNumber, formatRelative, plural, PLURALS } from '@/shared/lib/format';
import {
  COMPLAINT_REASON_META,
  HISTORY_KIND_META,
  MODERATION_ACTION_META,
  STATUS_META,
  VOTE_META,
  VOTE_KINDS,
} from '@/shared/lib/labels';
import { TONES } from '@/shared/lib/tones';
import { SPRING, TrustMeter, UserChip } from '@/shared/ui';

import { CaseSection } from './CaseReasons';

export function AuthorCard({ author }: { author: UserBrief }) {
  return (
    <CaseSection title="Автор">
      <div className="flex items-center justify-between gap-3">
        <UserChip user={author} caption="открыть профиль" />
        <p className="shrink-0 text-right">
          <span className="block font-display text-xl font-semibold text-ink tabular-nums">
            {formatNumber(author.reputation)}
          </span>
          <span className="text-xs text-ink-soft">{plural(author.reputation, PLURALS.point)}</span>
        </p>
      </div>
    </CaseSection>
  );
}

function ComplaintRow({ complaint }: { complaint: ComplaintItem }) {
  const reason = COMPLAINT_REASON_META[complaint.reason];
  const Icon = reason.icon;
  return (
    <li className="flex flex-col gap-2 rounded-control bg-canvas p-3">
      <p className={cn('flex items-center gap-1.5 text-sm font-semibold', TONES[reason.tone].text)}>
        <Icon size={15} aria-hidden />
        {reason.label}
      </p>
      {complaint.comment && <p className="text-base text-ink">{complaint.comment}</p>}
      <UserChip user={complaint.author} size="sm" caption={formatRelative(complaint.created_at)} />
    </li>
  );
}

export function ComplaintsCard({ complaints }: { complaints: readonly ComplaintItem[] }) {
  if (complaints.length === 0) return null;
  return (
    <CaseSection title={`Жалобы · ${complaints.length}`}>
      <ul className="flex flex-col gap-2">
        {complaints.map((complaint) => (
          <ComplaintRow key={complaint.id} complaint={complaint} />
        ))}
      </ul>
    </CaseSection>
  );
}

/** «Требует уточнения» votes: what residents wrote is wrong or has changed. */
export function ClarificationsCard({ items }: { items: readonly ClarificationItem[] }) {
  if (items.length === 0) return null;
  return (
    <CaseSection title={`Уточнения от жителей · ${items.length}`}>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id} className="flex flex-col gap-1.5 rounded-control bg-canvas p-3">
            <p className="text-base whitespace-pre-line text-ink">{item.text}</p>
            <UserChip user={item.author} size="sm" caption={formatRelative(item.created_at)} />
          </li>
        ))}
      </ul>
    </CaseSection>
  );
}

/** Present / absent / unclear votes as proportional bars, plus the trust score. */
export function VotesCard({ place }: { place: PlaceDetail }) {
  const { verification } = place;
  const total = VOTE_KINDS.reduce((sum, kind) => sum + verification[kind], 0);
  return (
    <CaseSection title="Голоса жителей">
      <ul className="flex flex-col gap-2.5">
        {VOTE_KINDS.map((kind) => {
          const meta = VOTE_META[kind];
          const count = verification[kind];
          return (
            <li key={kind} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
              <span className="text-sm text-ink">{meta.label}</span>
              <span className="text-sm font-semibold text-ink tabular-nums">{count}</span>
              <span className="col-span-2 h-2 overflow-hidden rounded-full bg-canvas">
                <motion.span
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: total > 0 ? count / total : 0 }}
                  transition={SPRING.soft}
                  className={cn('block h-full origin-left rounded-full', TONES[meta.tone].fill)}
                />
              </span>
            </li>
          );
        })}
      </ul>
      <TrustMeter score={place.trust_score} className="mt-4" />
    </CaseSection>
  );
}

export function AppealCard({ text }: { text: string }) {
  return (
    <CaseSection title="Апелляция автора">
      <p className="flex gap-2 text-base text-ink">
        <Quote size={16} aria-hidden className="mt-1 shrink-0 text-official" />
        {text}
      </p>
    </CaseSection>
  );
}

function HistoryRow({ entry }: { entry: HistoryEntry }) {
  const meta = HISTORY_KIND_META[entry.kind];
  const Icon = meta.icon;
  return (
    <li className="relative flex gap-3">
      <span
        className={cn(
          'relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-surface',
          TONES[meta.tone].soft,
        )}
      >
        <Icon size={15} aria-hidden />
      </span>
      <div className="min-w-0 pt-1 text-sm">
        <p className="text-ink">{entry.message}</p>
        {entry.old_status && entry.new_status && (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-soft">
            {STATUS_META[entry.old_status].label}
            <ArrowRight size={12} aria-hidden />
            {STATUS_META[entry.new_status].label}
          </p>
        )}
        <p className="mt-0.5 text-xs text-ink-faint">
          {[entry.actor?.display_name, formatDateTime(entry.created_at)]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
    </li>
  );
}

export function HistoryCard({ history }: { history: readonly HistoryEntry[] }) {
  if (history.length === 0) return null;
  return (
    <CaseSection title="История">
      <ol className="relative flex flex-col gap-4 before:absolute before:top-3 before:bottom-3 before:left-4 before:w-px before:bg-line">
        {history.map((entry) => (
          <HistoryRow key={entry.id} entry={entry} />
        ))}
      </ol>
    </CaseSection>
  );
}

export function ResolutionCard({
  resolution,
  resolvedAt,
}: {
  resolution: ModerationResolution;
  resolvedAt: string | null;
}) {
  const action = MODERATION_ACTION_META[resolution.action];
  const Icon = action.icon;
  return (
    <section className={cn('rounded-card p-4', TONES[action.tone].soft)}>
      <p className="flex items-center gap-2 font-display text-base font-semibold">
        <Icon size={18} aria-hidden />
        {action.done}
        {resolvedAt && (
          <span className="text-sm font-normal text-ink-soft">· {formatDateTime(resolvedAt)}</span>
        )}
      </p>
      <p className="mt-2 flex gap-2 text-base text-ink">
        <Gavel size={16} aria-hidden className="mt-1 shrink-0 text-ink-soft" />«{resolution.reason}»
      </p>
      <UserChip user={resolution.moderator} size="sm" caption="модератор" className="mt-3" />
    </section>
  );
}

/** Evidence column of the case page. */
export function CaseEvidence({ detail }: { detail: ModerationCaseDetail }) {
  return (
    <>
      <AuthorCard author={detail.author} />
      {detail.appeal_text && <AppealCard text={detail.appeal_text} />}
      <ComplaintsCard complaints={detail.complaints} />
      <ClarificationsCard items={detail.clarifications ?? []} />
      {detail.place && <VotesCard place={detail.place} />}
      <HistoryCard history={detail.history} />
    </>
  );
}
