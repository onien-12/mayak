import { EyeOff, Gauge, ImageOff, ShieldQuestion } from 'lucide-react';

import type { ModerationCaseDetail, PhotoReview } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import {
  AI_CATEGORY_LABELS,
  AI_VERDICT_META,
  ROUTE_STATUS_META,
  STATUS_META,
} from '@/shared/lib/labels';
import { TONES } from '@/shared/lib/tones';
import { Badge } from '@/shared/ui';

import { CaseSection } from './CaseReasons';
import { HOLD_SOURCE_LABELS, STANDING_LOW } from './moderationMeta';

function shownStatusLabel(detail: ModerationCaseDetail): string | null {
  const shown = detail.hold?.shown_status;
  if (!shown) return null;
  if (detail.route)
    return ROUTE_STATUS_META[shown as keyof typeof ROUTE_STATUS_META]?.label ?? null;
  return STATUS_META[shown as keyof typeof STATUS_META]?.label ?? null;
}

/**
 * The automatic check held the publication: only the author and moderators see it, and the
 * author has been told why (in words without the model's numbers or their standing).
 */
export function ScreeningHoldBanner({ detail }: { detail: ModerationCaseDetail }) {
  if (!detail.quiet || !detail.hold) return null;
  const shown = shownStatusLabel(detail);
  return (
    <section className={cn('rounded-card p-4', TONES.warning.soft)}>
      <p className="flex items-center gap-2 font-display text-base font-semibold">
        <EyeOff size={18} aria-hidden />
        Не прошло автоматическую проверку
      </p>
      <p className="mt-1.5 text-sm text-ink">
        Публикацию видят только автор и модераторы. Автору сообщили, что она не прошла проверку, и
        показали причины — без уверенности модели и его внутренней оценки; у себя он видит её «На
        проверке». «Одобрить» — обычное одобрение: автор получит уведомление
        {shown ? <>, а публикация вернётся в статус «{shown}»</> : null}.
      </p>
      {detail.hold.source && (
        <p className="mt-2 text-xs text-ink-soft">
          Причина: {HOLD_SOURCE_LABELS[detail.hold.source]}
        </p>
      )}
    </section>
  );
}

function Meter({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint: string;
  tone: 'success' | 'warning' | 'danger';
}) {
  return (
    <div className="rounded-control bg-canvas p-3">
      <p className="text-xs text-ink-soft">{label}</p>
      <p
        className={cn(
          'font-display text-2xl leading-tight font-semibold tabular-nums',
          TONES[tone].text,
        )}
      >
        {value}
        <span className="text-sm font-normal text-ink-soft"> / 100</span>
      </p>
      <p className="mt-0.5 text-xs text-ink-soft">{hint}</p>
    </div>
  );
}

/** Hidden signals for moderators only: usefulness of the place and standing of the author. */
export function HiddenSignals({ detail }: { detail: ModerationCaseDetail }) {
  const standingLow = detail.author_standing < STANDING_LOW;
  return (
    <CaseSection title="Скрытые оценки">
      <div className="grid grid-cols-2 gap-2">
        {detail.usefulness !== null ? (
          <Meter
            label="Польза места"
            value={detail.usefulness}
            hint={detail.usefulness < 15 ? 'Ниже 15 — удерживается' : 'По мнению ИИ'}
            tone={
              detail.usefulness < 15 ? 'danger' : detail.usefulness < 45 ? 'warning' : 'success'
            }
          />
        ) : (
          <div className="flex items-center gap-2 rounded-control bg-canvas p-3 text-xs text-ink-soft">
            <Gauge size={16} aria-hidden className="shrink-0" />
            Польза не оценивалась
          </div>
        )}
        <Meter
          label="Оценка автора"
          value={detail.author_standing}
          hint={standingLow ? `Ниже ${STANDING_LOW}: любое сомнение удерживает` : 'Старт — 50'}
          tone={standingLow ? 'danger' : detail.author_standing < 50 ? 'warning' : 'success'}
        />
      </div>
      <p className="mt-2 text-xs text-ink-soft">
        Видны только модераторам, на репутацию не влияют.
      </p>
    </CaseSection>
  );
}

function PhotoReviewItem({ item }: { item: PhotoReview }) {
  const review = item.ai_review;
  const verdict = review ? AI_VERDICT_META[review.verdict] : null;
  const held = item.state === 'held' || item.state === 'decided';
  return (
    <li
      className={cn(
        'flex gap-3 rounded-control border p-2',
        held ? 'border-danger/40 bg-danger-soft/40' : 'border-line/70 bg-canvas',
      )}
    >
      <img
        src={item.photo.url}
        alt="Фото публикации"
        loading="lazy"
        className="size-20 shrink-0 rounded-control object-cover"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
        <p className="flex flex-wrap items-center gap-1.5 font-semibold text-ink">
          {held ? (item.reasons[0]?.split(':')[0] ?? 'Фото') : 'Фото'}
          {held && (
            <Badge tone="danger" icon={ImageOff}>
              удержано
            </Badge>
          )}
          {item.state === 'screening' && <Badge tone="neutral">проверяется</Badge>}
        </p>
        {review && verdict ? (
          <>
            <p className={cn('flex items-center gap-1 font-medium', TONES[verdict.tone].text)}>
              {verdict.label} · {Math.round(review.confidence * 100)}%
            </p>
            {review.categories.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {review.categories.map((category) => (
                  <Badge key={category} tone={verdict.tone}>
                    {AI_CATEGORY_LABELS[category]}
                  </Badge>
                ))}
              </div>
            )}
            <p className="text-ink-soft">{review.summary}</p>
          </>
        ) : (
          <p className="flex items-center gap-1 text-ink-soft">
            <ShieldQuestion size={14} aria-hidden />
            {item.reasons[0] ?? 'Модель не ответила'}
          </p>
        )}
      </div>
    </li>
  );
}

/** «Фото по одному»: every photo with its own verdict, held ones first (SPEC §24.2). */
export function PhotoReviewsCard({ reviews }: { reviews: readonly PhotoReview[] }) {
  if (reviews.length === 0) return null;
  return (
    <CaseSection title={`Проверка фото · ${reviews.length}`}>
      <ul className="flex flex-col gap-2">
        {reviews.map((item) => (
          <PhotoReviewItem key={item.photo.id} item={item} />
        ))}
      </ul>
    </CaseSection>
  );
}
