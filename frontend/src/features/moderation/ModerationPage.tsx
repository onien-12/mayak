import { PageLayout, Tabs } from '@/shared/ui';

import { CaseList } from './CaseList';
import { HeldList } from './HeldList';
import { ModerationLog } from './ModerationLog';
import { QueueFilters } from './QueueFilters';
import { SummaryTiles } from './SummaryTiles';
import { useModerationSummary } from './useModeration';
import { useQueueParams, type ModerationTab } from './useQueueParams';

/**
 * Moderation (`/moderation`, moderators only): summary, the queue with filters, quietly held
 * photos / comments / reviews / notes, resolved cases and the decision log. Built to clear a
 * queue quickly, on a phone too.
 */
export default function ModerationPage() {
  const params = useQueueParams();
  const { tab, filters } = params;
  const summary = useModerationSummary();
  const tabs: { value: ModerationTab; label: string; count?: number }[] = [
    { value: 'open', label: 'Очередь' },
    { value: 'held', label: 'Удержано', count: summary.data?.held_items },
    { value: 'resolved', label: 'Решённые' },
    { value: 'log', label: 'Журнал' },
  ];

  return (
    <PageLayout
      title="Модерация"
      subtitle="Решает человек — ИИ только подсказывает"
      width="md"
      toolbar={<Tabs label="Разделы модерации" value={tab} onChange={params.setTab} tabs={tabs} />}
    >
      <div className="flex flex-col gap-5">
        {tab === 'open' && (
          <SummaryTiles activeTrigger={filters.trigger} onTrigger={params.setTrigger} />
        )}
        {(tab === 'open' || tab === 'resolved') && <QueueFilters params={params} />}
        {tab === 'log' && <ModerationLog />}
        {tab === 'held' && <HeldList />}
        {(tab === 'open' || tab === 'resolved') && <CaseList key={tab} filters={filters} />}
      </div>
    </PageLayout>
  );
}
