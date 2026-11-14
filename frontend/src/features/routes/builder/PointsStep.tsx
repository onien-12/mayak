import { ArrowRight, Hand, Landmark, LocateFixed, Plus, Search, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState, type ReactNode } from 'react';

import { useIsDesktop } from '@/shared/hooks';
import { formatDistance, plural, pluralize } from '@/shared/lib/format';
import {
  Banner,
  Button,
  fadeVariants,
  MapTopBar,
  PanelLayout,
  toast,
  usePanelStore,
} from '@/shared/ui';

import { ROUTE_PLURALS } from '../lib/plurals';
import { useVisibleCenter } from '../lib/visibleCenter';
import { PlacementPrompt } from '../ui/PlacementPrompt';
import { FULL_ROUTE_MESSAGE } from './actions';
import { visibleCount } from './model';
import { PathModeSwitch, PreviewSummary, RouteKindPicker } from './RouteSettings';
import { SearchResults } from './SearchResults';
import { StopList } from './StopList';
import { useBuilderStore } from './store';
import { StopSearchField, ToolChips } from './BuilderTools';
import { TOOL_HINTS } from './tools';
import type { RoutePreviewState } from './useRoutePreview';

const WAYS: { icon: typeof Hand; text: string }[] = [
  { icon: Plus, text: '«Добавить точку» — или просто нажмите на карту' },
  { icon: Search, text: 'Найдите место или адрес в поиске' },
  { icon: Landmark, text: '«Места» — выберите метку с карты' },
  { icon: LocateFixed, text: '«Я здесь» — точка там, где вы стоите' },
];

function Intro() {
  return (
    <div className="flex flex-col gap-3 rounded-card bg-canvas p-4">
      <p className="font-display text-base font-semibold text-ink">С чего начать</p>
      <ul className="flex flex-col gap-2.5">
        {WAYS.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-center gap-3 text-sm text-ink">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface text-brand shadow-card">
              <Icon size={16} aria-hidden />
            </span>
            {text}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

interface PointsStepProps {
  title: string;
  preview: RoutePreviewState;
  onClose: () => void;
  /** Shown above everything in the body (e.g. «restore the draft?»). */
  notice?: ReactNode;
}

/** Step 1 «Точки»: put stops on the map, describe and order them, choose how to travel. */
export function PointsStep({ title, preview, onClose, notice }: PointsStepProps) {
  const isDesktop = useIsDesktop();
  const stops = useBuilderStore((state) => state.draft.stops);
  const tool = useBuilderStore((state) => state.tool);
  const stopsError = useBuilderStore((state) => state.errors.stops);
  const setStep = useBuilderStore((state) => state.setStep);
  const placing = useBuilderStore((state) => state.placing);
  const reveal = usePanelStore((state) => state.reveal);
  const visibleCenter = useVisibleCenter();
  const [query, setQuery] = useState('');
  const count = visibleCount(stops);
  const missing = Math.max(0, 2 - count);

  // Picked: clear the field and drop the keyboard so the map with the new stop is visible.
  const finishSearch = () => {
    setQuery('');
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  };

  const startPlacing = () => {
    useBuilderStore.getState().setPlacing(true);
    const panel = usePanelStore.getState();
    if (panel.snap === 'full') panel.setSnap('half');
  };
  const placeInCenter = () => {
    const point = visibleCenter(useBuilderStore.getState().draft.stops);
    if (point && useBuilderStore.getState().addStop(point) === null) toast.info(FULL_ROUTE_MESSAGE);
  };
  const prompt = placing && (
    <PlacementPrompt
      text={`Нажмите на карту — там будет точка ${count + 1}`}
      onCenter={placeInCenter}
      onCancel={() => useBuilderStore.getState().setPlacing(false)}
    />
  );

  const subtitle =
    count === 0
      ? 'Добавьте первую точку'
      : `${pluralize(count, ROUTE_PLURALS.point)}${preview.path.length > 1 ? ` · ${preview.estimate ? '≈ ' : ''}${formatDistance(preview.distanceM)}` : ''}`;

  return (
    <>
      {!isDesktop && (
        <MapTopBar extra={prompt ? <div className="px-3">{prompt}</div> : <ToolChips floating />}>
          <StopSearchField pill value={query} onChange={setQuery} onFocus={reveal} />
        </MapTopBar>
      )}
      <PanelLayout
        title={title}
        subtitle={subtitle}
        onBack={onClose}
        backLabel="Закрыть конструктор"
        toolbar={
          isDesktop &&
          (prompt || (
            <div className="flex flex-col gap-3">
              <StopSearchField value={query} onChange={setQuery} />
              <ToolChips />
            </div>
          ))
        }
        footer={
          <div className="flex gap-2">
            <Button
              size="lg"
              icon={Plus}
              variant={missing > 0 ? 'primary' : 'secondary'}
              disabled={placing}
              onClick={startPlacing}
              className="flex-1"
            >
              Добавить точку
            </Button>
            <Button
              size="lg"
              iconRight={ArrowRight}
              variant={missing > 0 ? 'secondary' : 'primary'}
              disabled={missing > 0}
              onClick={() => setStep('details')}
              className="flex-1"
            >
              {missing > 0 ? `Ещё ${missing} ${plural(missing, ROUTE_PLURALS.point)}` : 'Далее'}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-5">
          {notice}
          {query.trim() && <SearchResults query={query} onPicked={finishSearch} />}

          <AnimatePresence mode="wait" initial={false}>
            {stops.length > 0 && (
              <motion.p
                key={tool}
                variants={fadeVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="flex items-center gap-2 text-sm text-ink-soft"
              >
                <Hand size={16} aria-hidden className="shrink-0 text-brand" />
                {TOOL_HINTS[tool]}
              </motion.p>
            )}
          </AnimatePresence>

          {stopsError && (
            <Banner tone="danger" icon={X}>
              {stopsError}
            </Banner>
          )}
          {stops.length === 0 ? <Intro /> : <StopList preview={preview} />}

          <Section title="Как пойдём">
            <RouteKindPicker />
            <PathModeSwitch />
            <PreviewSummary preview={preview} />
          </Section>
        </div>
      </PanelLayout>
    </>
  );
}
