import { Bot, ScanSearch } from 'lucide-react';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';

import type { AiReview, ModerationCaseDetail } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { formatRelative } from '@/shared/lib/format';
import { AI_CATEGORY_LABELS, AI_VERDICT_META, MODERATION_TRIGGER_META } from '@/shared/lib/labels';
import { TONES } from '@/shared/lib/tones';
import { Badge, SPRING } from '@/shared/ui';

import { TRIGGER_EXPLANATIONS } from './moderationMeta';

export function CaseSection({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-card border border-line/70 bg-surface p-4', className)}>
      <h2 className="mb-3 font-display text-sm font-semibold tracking-wide text-ink-soft uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** «Почему здесь»: every trigger explained in plain Russian, plus the automatic flags. */
export function WhyHere({ detail }: { detail: ModerationCaseDetail }) {
  return (
    <CaseSection title="Почему здесь">
      <ul className="flex flex-col gap-3">
        {detail.triggers.map((trigger) => {
          const meta = MODERATION_TRIGGER_META[trigger];
          const Icon = meta.icon;
          return (
            <li key={trigger} className="flex gap-3">
              <span
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-full',
                  TONES[meta.tone].soft,
                )}
              >
                <Icon size={17} aria-hidden />
              </span>
              <p className="text-sm text-ink-soft">
                <span className="block text-base font-semibold text-ink">{meta.label}</span>
                {TRIGGER_EXPLANATIONS[trigger]}
              </p>
            </li>
          );
        })}
      </ul>
      {detail.flags.length > 0 && (
        <div className="mt-4 rounded-control bg-warning-soft p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-warning-ink">
            <ScanSearch size={15} aria-hidden />
            Автопроверка нашла
          </p>
          <ul className="mt-1.5 list-disc pl-5 text-sm text-ink">
            {detail.flags.map((flag) => (
              <li key={flag}>{flag}</li>
            ))}
          </ul>
        </div>
      )}
    </CaseSection>
  );
}

/** «Мнение ИИ»: the advisory LLM verdict — clearly not a decision. */
export function AiReviewCard({ review }: { review: AiReview }) {
  const verdict = AI_VERDICT_META[review.verdict];
  const VerdictIcon = verdict.icon;
  const confidence = Math.round(review.confidence * 100);

  return (
    <section className="overflow-hidden rounded-card border border-event/25 bg-event-soft/50 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold text-ink">
          <Bot size={18} aria-hidden className="text-event" />
          Мнение ИИ
        </h2>
        <Badge tone="neutral">Совет, не решение</Badge>
      </div>
      <p
        className={cn(
          'mt-3 flex items-center gap-2 text-lg font-semibold',
          TONES[verdict.tone].text,
        )}
      >
        <VerdictIcon size={20} aria-hidden />
        {verdict.label}
      </p>
      {review.categories.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {review.categories.map((category) => (
            <Badge key={category} tone={verdict.tone}>
              {AI_CATEGORY_LABELS[category]}
            </Badge>
          ))}
        </div>
      )}
      <div className="mt-3">
        <div className="flex justify-between text-xs text-ink-soft">
          <span>Уверенность модели</span>
          <span className="font-semibold text-ink tabular-nums">{confidence}%</span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface">
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: review.confidence }}
            transition={{ ...SPRING.soft, delay: 0.1 }}
            className="h-full origin-left rounded-full bg-event"
          />
        </div>
      </div>
      <p className="mt-3 text-base text-ink">{review.summary}</p>
      <p className="mt-3 text-xs text-ink-soft">
        {review.model} · {formatRelative(review.created_at)}. ИИ может ошибаться — решение принимает
        модератор.
      </p>
    </section>
  );
}
