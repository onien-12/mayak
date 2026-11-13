import { Bot, CheckCheck, ChevronRight, ScanSearch } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { Link } from 'react-router';

import type { HeldItem, HeldKind } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { formatRelative } from '@/shared/lib/format';
import { AI_CATEGORY_LABELS, AI_VERDICT_META, MODERATION_ACTION_META } from '@/shared/lib/labels';
import { TONES } from '@/shared/lib/tones';
import {
  Badge,
  Button,
  Chip,
  EmptyState,
  ErrorState,
  ListSkeleton,
  RatingStars,
  SPRING,
  STAGGER_LIMIT,
  STAGGER_STEP,
  toast,
  TWEEN,
  UserChip,
} from '@/shared/ui';

import { DecisionDialog } from './DecisionDialog';
import { HELD_KIND_LABELS, HOLD_SOURCE_LABELS, STANDING_LOW } from './moderationMeta';
import { useDecideHeld, useHeldItems, type HeldDecision } from './useModeration';

const KINDS = Object.keys(HELD_KIND_LABELS) as HeldKind[];

function ownerLink(item: HeldItem): { to: string; title: string } | null {
  if (item.place) return { to: `/?place=${item.place.id}`, title: item.place.title };
  if (item.route) return { to: `/routes/${item.route.id}`, title: item.route.title };
  return null;
}

function HeldCard({
  item,
  disabled,
  onChoose,
}: {
  item: HeldItem;
  disabled: boolean;
  onChoose: (action: HeldDecision) => void;
}) {
  const owner = ownerLink(item);
  const review = item.ai_review;
  const verdict = review ? AI_VERDICT_META[review.verdict] : null;

  return (
    <article className="flex flex-col gap-3 rounded-card border border-line/70 bg-surface p-3 lg:p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge tone="warning">{HELD_KIND_LABELS[item.kind]}</Badge>
        {item.source && <span className="text-ink-soft">{HOLD_SOURCE_LABELS[item.source]}</span>}
        <span className="text-ink-faint">· {formatRelative(item.created_at)}</span>
      </div>

      {item.photo && (
        <img
          src={item.photo.url}
          alt="Удержанное фото"
          loading="lazy"
          className="max-h-64 w-full rounded-control bg-canvas object-contain"
        />
      )}
      {item.rating !== null && <RatingStars value={item.rating} />}
      {item.text && (
        <p className="rounded-control bg-canvas px-3 py-2 text-base whitespace-pre-line text-ink">
          {item.text}
        </p>
      )}
      {item.object_name && <p className="text-sm text-ink-soft">У объекта «{item.object_name}»</p>}
      {owner && (
        <Link
          to={owner.to}
          className="flex items-center gap-1 text-sm font-medium text-ink hover:underline"
        >
          <span className="line-clamp-1">К «{owner.title}»</span>
          <ChevronRight size={14} aria-hidden className="shrink-0 text-ink-faint" />
        </Link>
      )}

      {item.reasons.length > 0 && (
        <div className="rounded-control bg-warning-soft p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-warning-ink">
            <ScanSearch size={15} aria-hidden />
            Почему удержано
          </p>
          <ul className="mt-1 list-disc pl-5 text-sm text-ink">
            {item.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}
      {review && verdict && (
        <div className="flex flex-col gap-1 text-sm">
          <p className={cn('flex items-center gap-1.5 font-medium', TONES[verdict.tone].text)}>
            <Bot size={15} aria-hidden />
            ИИ: {verdict.label.toLowerCase()} · {Math.round(review.confidence * 100)}%
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
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <UserChip user={item.author} size="sm" caption="автор" />
        <span
          className={cn(
            'shrink-0 text-xs',
            item.author_standing < STANDING_LOW ? 'font-semibold text-danger-ink' : 'text-ink-soft',
          )}
        >
          оценка {item.author_standing}/100
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(['release', 'remove'] as const).map((action) => {
          const meta = MODERATION_ACTION_META[action];
          return (
            <Button
              key={action}
              variant={action === 'remove' ? 'danger' : 'secondary'}
              icon={meta.icon}
              disabled={disabled}
              onClick={() => onChoose(action)}
            >
              {meta.label}
            </Button>
          );
        })}
      </div>
    </article>
  );
}

/**
 * «Удержано»: photos, comments, reviews and notes held quietly on their own (SPEC §24.1).
 * Their authors see them as published; a moderator either releases or removes them.
 */
export function HeldList() {
  const [kind, setKind] = useState<HeldKind | undefined>(undefined);
  const [choice, setChoice] = useState<{ item: HeldItem; action: HeldDecision } | null>(null);
  const held = useHeldItems(kind);
  const decide = useDecideHeld(({ action, item }) => {
    setChoice(null);
    toast.success(
      `${MODERATION_ACTION_META[action].done}: ${HELD_KIND_LABELS[item.kind].toLowerCase()}`,
    );
  });
  const items = held.data?.pages.flat() ?? [];

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-soft">
        Автор видит удержанное как опубликованное и не узнает о проверке, пока вы не уберёте
        элемент.
      </p>
      <div className="-mx-4 no-scrollbar flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0">
        <Chip selected={kind === undefined} onClick={() => setKind(undefined)}>
          Все
        </Chip>
        {KINDS.map((value) => (
          <Chip key={value} selected={kind === value} onClick={() => setKind(value)}>
            {HELD_KIND_LABELS[value]}
          </Chip>
        ))}
      </div>
      {held.isPending ? (
        <ListSkeleton rows={3} />
      ) : held.isError ? (
        <ErrorState error={held.error} onRetry={() => void held.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={CheckCheck}
          title="Ничего не удержано"
          description="Фото, комментарии, отзывы и заметки, не прошедшие проверку, появятся здесь."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {items.map((item, index) => (
              <motion.li
                key={item.id}
                layout="position"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 40, transition: TWEEN.base }}
                transition={{
                  ...SPRING.sheet,
                  delay: Math.min(index, STAGGER_LIMIT) * STAGGER_STEP,
                }}
              >
                <HeldCard
                  item={item}
                  disabled={decide.isPending}
                  onChoose={(action) => setChoice({ item, action })}
                />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
      {held.hasNextPage && (
        <Button
          variant="secondary"
          loading={held.isFetchingNextPage}
          onClick={() => void held.fetchNextPage()}
        >
          Показать ещё
        </Button>
      )}
      <DecisionDialog
        action={choice?.action ?? null}
        loading={decide.isPending}
        onClose={() => setChoice(null)}
        onConfirm={(reason) => choice && decide.mutate({ ...choice, reason })}
      />
    </div>
  );
}
