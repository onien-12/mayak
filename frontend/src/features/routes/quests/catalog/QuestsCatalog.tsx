import { Plus, Puzzle, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import { useMapActions } from '@/features/map';
import { requireAuth, useAuth } from '@/features/auth';
import type { QuestSort } from '@/shared/api';
import { useDebouncedValue, useIsDesktop } from '@/shared/hooks';
import { pluralize } from '@/shared/lib/format';
import { boundsOfPoints } from '@/shared/lib/geo';
import {
  Button,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  ListSkeleton,
  PanelLayout,
  SegmentedControl,
  StaggerItem,
  Tabs,
} from '@/shared/ui';

import { CatalogSwitch } from '../../catalog/CatalogSwitch';
import { QUEST_PLURALS } from '../lib/meta';
import { StartMarker } from '../QuestMarkers';
import { useQuestsCatalog } from '../useQuests';
import { QuestListItem } from './QuestListItem';

type Scope = 'all' | 'mine';

const SORTS: { value: QuestSort; label: string }[] = [
  { value: 'new', label: 'Новые' },
  { value: 'popular', label: 'Популярные' },
  { value: 'rating', label: 'По оценке' },
];

/** «Квесты» inside «Маршруты»: cards with their start points on the map, own quests, search. */
export function QuestsCatalog() {
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const { isAuthenticated } = useAuth();
  const { fitBounds, ready } = useMapActions();
  const [scope, setScope] = useState<Scope>('all');
  const [sort, setSort] = useState<QuestSort>('new');
  const [search, setSearch] = useState('');
  const query = useDebouncedValue(search.trim(), 350);
  const mine = isAuthenticated && scope === 'mine';
  const catalog = useQuestsCatalog({ q: query || undefined, sort }, mine);
  const quests = catalog.data;
  const framed = useRef(false);

  useEffect(() => {
    if (framed.current || !ready || !quests || quests.length === 0) return;
    const bounds = boundsOfPoints(quests.map((quest) => quest.start));
    if (bounds) fitBounds(bounds, { maxZoom: 15 });
    framed.current = true;
  }, [quests, ready, fitBounds]);

  const create = () => requireAuth(() => navigate('/quests/new'), 'чтобы придумать свой квест');

  const searchField = (
    <Input
      icon={Search}
      value={search}
      onChange={(event) => setSearch(event.target.value)}
      placeholder="Найти квест"
      aria-label="Найти квест"
    />
  );

  return (
    <>
      {quests?.map((quest) => (
        <StartMarker
          key={quest.id}
          position={quest.start}
          label={`Старт квеста «${quest.title}»`}
          onClick={() => navigate(`/quests/${quest.id}`)}
        />
      ))}
      <PanelLayout
        title={quests ? pluralize(quests.length, QUEST_PLURALS.quest) : 'Квесты'}
        subtitle="Загадки по городу: этап за этапом"
        actions={
          search && <IconButton icon={X} label="Очистить поиск" onClick={() => setSearch('')} />
        }
        toolbar={
          <div className="flex flex-col gap-3">
            <CatalogSwitch />
            {isDesktop && searchField}
          </div>
        }
        footer={
          <Button block size="lg" icon={Plus} onClick={create}>
            Придумать квест
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          {isAuthenticated && (
            <Tabs<Scope>
              label="Какие квесты показать"
              value={scope}
              onChange={setScope}
              tabs={[
                { value: 'all', label: 'Все квесты' },
                { value: 'mine', label: 'Мои квесты' },
              ]}
            />
          )}
          {!isDesktop && searchField}
          {!mine && (
            <SegmentedControl<QuestSort>
              label="Порядок"
              size="sm"
              value={sort}
              onChange={setSort}
              options={SORTS}
            />
          )}
          {catalog.isPending && <ListSkeleton rows={3} />}
          {catalog.isError && (
            <ErrorState error={catalog.error} onRetry={() => void catalog.refetch()} />
          )}
          {quests?.length === 0 && (
            <EmptyState
              icon={Puzzle}
              title={mine ? 'Придумайте первый квест' : 'Квестов пока нет'}
              description="Цепочка загадок: игрок видит следующий этап, только когда нашёл место текущего. Можно играть одному или командой."
              action={
                <Button icon={Plus} onClick={create}>
                  Придумать квест
                </Button>
              }
            />
          )}
          {quests && quests.length > 0 && (
            <ul className="flex flex-col gap-2">
              {quests.map((quest, index) => (
                <StaggerItem key={quest.id} index={index}>
                  <QuestListItem quest={quest} showState={mine} />
                </StaggerItem>
              ))}
            </ul>
          )}
          {quests && quests.length > 0 && (
            <p className="text-center text-xs text-ink-faint">
              На карте — только места старта: где этапы, узнаете в игре.
            </p>
          )}
        </div>
      </PanelLayout>
    </>
  );
}
