import {
  ChevronDown,
  PackageCheck,
  RotateCcw,
  Search,
  SearchCheck,
  SlidersHorizontal,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { requireAuth, useAuth } from '@/features/auth';
import { MapCircle } from '@/features/map';
import type { LostKind } from '@/shared/api';
import { useIsDesktop } from '@/shared/hooks';
import { cn } from '@/shared/lib/cn';
import { plural } from '@/shared/lib/format';
import {
  Button,
  Chip,
  EmptyState,
  ErrorState,
  IconButton,
  ListSkeleton,
  PanelLayout,
  SegmentedControl,
  Spinner,
  usePanelSection,
  usePanelStore,
} from '@/shared/ui';

import { countActiveFilters, PERIOD_OPTIONS, useLostFilters } from './filtersStore';
import { LostCard } from './LostCard';
import { LostMapLayer } from './LostMapLayer';
import { LOST_CATEGORIES, LOST_CATEGORY_META, LOST_KIND_META } from './lostMeta';
import { LostSearch, type SearchArea } from './LostSearch';
import { useLostList, useMyLostItems } from './useLost';

const POST_FORMS = ['объявление', 'объявления', 'объявлений'] as const;
const FILTERS_ID = 'lost-filters';
const SEARCH_ID = 'lost-search';
const KIND_OPTIONS: readonly { value: LostKind | 'all'; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'found', label: 'Нашли' },
  { value: 'lost', label: 'Потеряли' },
];

/** Category and period: behind «Фильтры», above the list they filter. */
function Filters() {
  const filters = useLostFilters();
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-1.5">
        {LOST_CATEGORIES.map((category) => (
          <Chip
            key={category}
            icon={LOST_CATEGORY_META[category].icon}
            selected={filters.categories.includes(category)}
            onClick={() => filters.toggleCategory(category)}
          >
            {LOST_CATEGORY_META[category].label}
          </Chip>
        ))}
      </div>
      <div className="flex gap-1.5">
        {PERIOD_OPTIONS.map((option) => (
          <Chip
            key={option.value}
            selected={filters.period === option.value}
            onClick={() => filters.setPeriod(option.value)}
          >
            {option.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}

interface SearchFoldProps {
  open: boolean;
  controls: string;
  onToggle: () => void;
}

function FoldChevron({ open }: { open: boolean }) {
  return (
    <ChevronDown
      size={16}
      aria-hidden
      className={cn('text-ink-faint transition-transform duration-200', open && 'rotate-180')}
    />
  );
}

/** «Потеряли вещь? Проверьте находки» folded to one row; a tap opens the search form. */
function SearchFold({ open, controls, onToggle }: SearchFoldProps) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      className="flex h-11 w-full items-center gap-2 rounded-control border border-line/70 bg-canvas/60 px-3 text-left text-sm font-semibold text-ink transition-colors hover:bg-canvas"
    >
      <SearchCheck size={18} aria-hidden className="shrink-0 text-success-ink" />
      <span className="min-w-0 flex-1 truncate">Потеряли вещь? Проверьте находки</span>
      <FoldChevron open={open} />
    </button>
  );
}

function MyPosts() {
  const { user } = useAuth();
  const mine = useMyLostItems(user !== null);
  if (!mine.data || mine.data.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-ink">Мои объявления</h2>
      {mine.data.map((item) => (
        <LostCard key={item.id} item={item} />
      ))}
    </section>
  );
}

/**
 * «Потеряшки»: what residents found and lost, with the place on the map. As in «События», the
 * filters sit in the panel above the list they filter — nothing section-specific floats over the
 * map. The search «что потеряли, где, когда» works without an account; on phones it is folded to
 * one row so the half-open sheet still shows the first post. Pins are drawn only on this tab.
 */
export default function LostPanel() {
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const setSnap = usePanelStore((state) => state.setSnap);
  const list = useLostList();
  const filters = useLostFilters();
  const { covered } = usePanelSection();
  const [area, setArea] = useState<SearchArea | null>(null);
  const [searchOpen, setSearchOpen] = useState(isDesktop);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilters = countActiveFilters(filters);
  const hiddenFilters =
    (filters.categories.length > 0 ? 1 : 0) + (filters.period !== 'all' ? 1 : 0);
  const items = list.data ?? [];

  // Phones: the sheet scrolls only at full height, and a form needs the room anyway.
  const expand = () => {
    if (!isDesktop) setSnap('full');
  };
  const toggleSearch = () => {
    if (searchOpen) setArea(null);
    else expand();
    setSearchOpen(!searchOpen);
  };
  const toggleFilters = () => {
    if (!filtersOpen) expand();
    setFiltersOpen(!filtersOpen);
  };
  const create = (kind: LostKind) =>
    requireAuth(() => navigate(`/lost/new?kind=${kind}`), 'чтобы подать объявление');

  const count = list.data
    ? `${items.length} ${plural(items.length, POST_FORMS)}`
    : 'Находки и пропажи жителей';

  return (
    <>
      {!covered && <LostMapLayer items={items} onOpen={(id) => navigate(`/lost/${id}`)} />}
      {!covered && area && (
        <MapCircle center={area.center} radiusM={area.radiusM} color="#1F9D55" />
      )}
      <PanelLayout
        title="Потеряшки"
        subtitle={list.data ? `${count} за последний месяц` : count}
        actions={
          <>
            {list.isFetching && !list.isPending && <Spinner size={16} className="mr-1" />}
            {activeFilters > 0 && (
              <IconButton icon={RotateCcw} label="Сбросить фильтры" onClick={filters.reset} />
            )}
          </>
        }
        toolbar={
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <SegmentedControl
                label="Что показать"
                value={filters.kind}
                onChange={filters.setKind}
                options={KIND_OPTIONS}
                className="min-w-0 flex-1"
              />
              <Button
                variant={filtersOpen || hiddenFilters > 0 ? 'soft' : 'secondary'}
                icon={SlidersHorizontal}
                aria-expanded={filtersOpen}
                aria-controls={FILTERS_ID}
                onClick={toggleFilters}
                className="shrink-0 px-3"
              >
                <span className="sr-only lg:not-sr-only">Фильтры</span>
                {hiddenFilters > 0 && (
                  <span className="rounded-full bg-brand px-1.5 text-2xs leading-[18px] font-semibold text-white">
                    {hiddenFilters}
                  </span>
                )}
                <FoldChevron open={filtersOpen} />
              </Button>
            </div>
            <SearchFold open={searchOpen} controls={SEARCH_ID} onToggle={toggleSearch} />
          </div>
        }
        footer={
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              icon={LOST_KIND_META.lost.icon}
              onClick={() => create('lost')}
            >
              Я потерял
            </Button>
            <Button icon={PackageCheck} onClick={() => create('found')}>
              Я нашёл
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {searchOpen && (
            <div id={SEARCH_ID} className="animate-fade-in">
              <LostSearch onArea={setArea} />
            </div>
          )}
          {filtersOpen && (
            <section
              id={FILTERS_ID}
              aria-label="Категория и период"
              className="animate-fade-in rounded-card border border-line/70 p-3.5"
            >
              <Filters />
            </section>
          )}
          {list.isPending ? (
            <ListSkeleton rows={4} />
          ) : list.isError ? (
            <ErrorState error={list.error} onRetry={() => void list.refetch()} />
          ) : items.length === 0 ? (
            <EmptyState
              icon={Search}
              title="Объявлений нет"
              description={
                activeFilters > 0
                  ? 'Под эти фильтры ничего не подходит — попробуйте их ослабить.'
                  : 'Нашли чужую вещь или потеряли свою — расскажите, это займёт минуту.'
              }
            />
          ) : (
            <div className="flex flex-col gap-2">
              {items.map((item) => (
                <LostCard key={item.id} item={item} />
              ))}
            </div>
          )}
          <MyPosts />
        </div>
      </PanelLayout>
    </>
  );
}
