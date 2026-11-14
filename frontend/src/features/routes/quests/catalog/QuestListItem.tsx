import { Lock, Puzzle } from 'lucide-react';

import type { QuestCard } from '@/shared/api';
import { formatDuration, pluralize } from '@/shared/lib/format';
import { ROUTE_STATUS_META } from '@/shared/lib/labels';
import { Badge, ListCard, ListMark, ListRating } from '@/shared/ui';

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

/**
 * Quest card: cover, name, where it starts, stages and time, rating. Never a stage point; the
 * author and how many finished are on the quest page.
 */
export function QuestListItem({
  quest,
  highlighted = false,
  showState = false,
}: QuestListItemProps) {
  const ownState = showState && (quest.visibility === 'private' || quest.status !== 'published');
  return (
    <ListCard
      media={
        quest.cover_url ? (
          <img src={quest.cover_url} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center bg-event-soft text-event">
            <Puzzle size={36} aria-hidden />
          </span>
        )
      }
      title={quest.title}
      to={`/quests/${quest.id}`}
      meta={`Старт: ${quest.start.title}`}
      marks={
        <>
          <ListMark strong>
            {pluralize(quest.stages_count, QUEST_PLURALS.stage)} · ~
            {formatDuration(quest.duration_min)}
          </ListMark>
          <ListRating item={quest} ownLabel="Оценка квеста" />
        </>
      }
      footer={ownState && <QuestStateBadge quest={quest} />}
      highlight={highlighted && 'brand'}
    />
  );
}
