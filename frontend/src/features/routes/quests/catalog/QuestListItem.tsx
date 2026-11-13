import { Flag, Lock, Puzzle, Star, Trophy } from 'lucide-react';
import { Link } from 'react-router';

import type { QuestCard } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { formatDuration, formatNumber, pluralize } from '@/shared/lib/format';
import { ROUTE_STATUS_META } from '@/shared/lib/labels';
import { Avatar, Badge } from '@/shared/ui';

import { QUEST_PLURALS } from '../lib/meta';

/** What only the author sees: a draft or a quest that is not live. */
export function QuestStateBadge({ quest }: { quest: Pick<QuestCard, 'status' | 'visibility'> }) {
  if (quest.visibility === 'private') {
    return (
      <Badge tone="neutral" icon={Lock} size="sm">
        Черновик — видите только вы
      </Badge>
    );
  }
  if (quest.status === 'published') return null;
  const status = ROUTE_STATUS_META[quest.status];
  return (
    <Badge tone={status.tone} icon={status.icon} size="sm">
      {status.label}
    </Badge>
  );
}

interface QuestListItemProps {
  quest: QuestCard;
  highlighted?: boolean;
  showState?: boolean;
}

/** Quest card: cover, stages, time, start area, rating, how many finished. Never a stage point. */
export function QuestListItem({
  quest,
  highlighted = false,
  showState = false,
}: QuestListItemProps) {
  return (
    <article
      className={cn(
        'group relative flex gap-3 rounded-card border bg-surface p-2.5 transition-[border-color,box-shadow,scale] duration-150 has-[h3>a:active]:scale-[0.98]',
        highlighted
          ? 'border-brand shadow-card'
          : 'border-line/70 hover:border-ink-faint/50 hover:shadow-card',
      )}
    >
      <div className="relative flex size-[92px] shrink-0 items-center justify-center overflow-hidden rounded-control bg-event-soft text-event">
        {quest.cover_url ? (
          <img src={quest.cover_url} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <Puzzle size={36} aria-hidden />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex items-center gap-1 text-xs font-medium text-event-ink">
          <Puzzle size={13} aria-hidden className="shrink-0" />
          Квест
        </p>
        <h3 className="line-clamp-2 text-base leading-tight font-semibold text-ink">
          <Link
            to={`/quests/${quest.id}`}
            className="after:absolute after:inset-0 after:rounded-card focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-brand"
          >
            {quest.title}
          </Link>
        </h3>
        <p className="text-sm text-ink-soft tabular-nums">
          {pluralize(quest.stages_count, QUEST_PLURALS.stage)}
          <span aria-hidden className="mx-1.5 text-ink-faint">
            ·
          </span>
          ~{formatDuration(quest.duration_min)}
        </p>
        <p className="flex min-w-0 items-center gap-1 text-xs text-ink-soft">
          <Flag size={12} aria-hidden className="shrink-0 text-ink-faint" />
          <span className="truncate">Старт: {quest.start.title}</span>
        </p>
        {showState && (
          <div className="flex">
            <QuestStateBadge quest={quest} />
          </div>
        )}
        <div className="mt-auto flex items-center gap-3 pt-0.5 text-xs text-ink-soft">
          <span className="flex min-w-0 items-center gap-1.5">
            <Avatar id={quest.author.id} name={quest.author.display_name} size={20} />
            <span className="truncate">{quest.author.display_name}</span>
          </span>
          {quest.rating_avg !== null && quest.rating_count > 0 && (
            <span className="flex shrink-0 items-center gap-0.5 font-semibold text-ink">
              <Star size={12} aria-hidden className="fill-beam text-beam" />
              {quest.rating_avg.toFixed(1).replace('.', ',')}
            </span>
          )}
          {quest.finished_count > 0 && (
            <span className="flex shrink-0 items-center gap-0.5" title="Прошли до конца">
              <Trophy size={12} aria-hidden className="text-warning-ink" />
              {formatNumber(quest.finished_count)}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
