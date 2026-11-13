import { CheckCheck, Inbox } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import {
  Button,
  EmptyState,
  ErrorState,
  ListSkeleton,
  SPRING,
  STAGGER_LIMIT,
  STAGGER_STEP,
  TWEEN,
} from '@/shared/ui';

import { CaseRow } from './CaseRow';
import { useQueue, type QueueFilters } from './useModeration';

/** Paged list of cases (open or resolved) with «Показать ещё». */
export function CaseList({ filters }: { filters: QueueFilters }) {
  const queue = useQueue(filters);
  const cases = queue.data?.pages.flat() ?? [];
  const resolved = filters.state === 'resolved';

  if (queue.isPending) return <ListSkeleton rows={4} />;
  if (queue.isError) return <ErrorState error={queue.error} onRetry={() => void queue.refetch()} />;
  if (cases.length === 0) {
    return resolved ? (
      <EmptyState
        icon={Inbox}
        title="Решённых обращений нет"
        description="Попробуйте снять фильтры."
      />
    ) : (
      <EmptyState
        icon={CheckCheck}
        title="Очередь пуста"
        description="Все обращения разобраны — отличная работа! Новые появятся здесь автоматически."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {cases.map((item, index) => (
            <motion.li
              key={item.id}
              layout="position"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: 40, transition: TWEEN.base }}
              transition={{ ...SPRING.sheet, delay: Math.min(index, STAGGER_LIMIT) * STAGGER_STEP }}
            >
              <CaseRow item={item} filters={filters} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {queue.hasNextPage && (
        <Button
          variant="secondary"
          loading={queue.isFetchingNextPage}
          onClick={() => void queue.fetchNextPage()}
        >
          Показать ещё
        </Button>
      )}
    </div>
  );
}
