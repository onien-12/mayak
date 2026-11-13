import {
  ArrowRight,
  Hand,
  Landmark,
  LocateFixed,
  MousePointerClick,
  Search,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState, type ReactNode } from 'react';

import { useIsDesktop } from '@/shared/hooks';
import { formatDistance, plural, pluralize } from '@/shared/lib/format';
import { Banner, Button, fadeVariants, MapTopBar, PanelLayout, usePanelStore } from '@/shared/ui';

import { ROUTE_PLURALS } from '../lib/plurals';
import { visibleCount } from './model';
import { PathModeSwitch, PreviewSummary, RouteKindPicker } from './RouteSettings';
import { SearchResults } from './SearchResults';
import { StopList } from './StopList';
import { useBuilderStore } from './store';
import { StopSearchField, ToolChips } from './BuilderTools';
import { TOOL_HINTS } from './tools';
import type { RoutePreviewState } from './useRoutePreview';

const WAYS: { icon: typeof Hand; text: string }[] = [
  { icon: MousePointerClick, text: 'Нажмите на карту — там появится точка' },
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
  const reveal = usePanelStore((state) => state.reveal);
  const [query, setQuery] = useState('');
  const count = visibleCount(stops);
  const missing = Math.max(0, 2 - count);

  // Picked: clear the field and drop the keyboard so the map with the new stop is visible.
  const finishSearch = () => {
    setQuery('');
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  };

  const subtitle =
    count === 0
      ? 'Добавьте первую точку'
      : `${pluralize(count, ROUTE_PLURALS.point)}${preview.path.length > 1 ? ` · ${preview.estimate ? '≈ ' : ''}${formatDistance(preview.distanceM)}` : ''}`;

  return (
    <>
      {!isDesktop && (
        <MapTopBar extra={<ToolChips floating />}>
          <StopSearchField pill value={query} onChange={setQuery} onFocus={reveal} />
        </MapTopBar>
      )}
      <PanelLayout
        title={title}
        subtitle={subtitle}
        onBack={onClose}
        backLabel="Закрыть конструктор"
        toolbar={
          isDesktop && (
            <div className="flex flex-col gap-3">
              <StopSearchField value={query} onChange={setQuery} />
              <ToolChips />
            </div>
          )
        }
        footer={
          <Button
            block
            size="lg"
            iconRight={ArrowRight}
            disabled={missing > 0}
            onClick={() => setStep('details')}
          >
            {missing > 0
              ? `Ещё ${missing} ${plural(missing, ROUTE_PLURALS.point)} — и дальше`
              : 'Далее: о маршруте'}
          </Button>
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
