import { Megaphone, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { requireAuth } from '@/features/auth';
import { useMapViewport } from '@/features/map';
import type { LostCategory, LostRadius, LostSearchQuery } from '@/shared/api';
import { useDebouncedValue } from '@/shared/hooks';
import type { LatLng } from '@/shared/lib/geo';
import { Button, Field, IconButton, Input, ListSkeleton, Select } from '@/shared/ui';

import { LostCard } from './LostCard';
import { LOST_CATEGORIES, LOST_CATEGORY_META, toDayValue } from './lostMeta';
import { useLostSearch } from './useLost';

const SEARCH_DEBOUNCE_MS = 400;
const MIN_QUERY = 2;

type Where = 'city' | LostRadius;

const WHERE_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'city', label: 'По всему городу' },
  { value: '300', label: 'В 300 м от центра карты' },
  { value: '1000', label: 'В 1 км от центра карты' },
  { value: '3000', label: 'В 3 км от центра карты' },
];

export interface SearchArea {
  center: LatLng;
  radiusM: number;
}

interface LostSearchProps {
  /** The circle searched around, for the map; null — the whole city. */
  onArea: (area: SearchArea | null) => void;
}

/** «Что потеряли, где, когда» — a filter over found posts; nothing is published, no account needed. */
export function LostSearch({ onArea }: LostSearchProps) {
  const navigate = useNavigate();
  const viewport = useMapViewport();
  const [text, setText] = useState('');
  const [category, setCategory] = useState<LostCategory | ''>('');
  const [lostOn, setLostOn] = useState('');
  const [where, setWhere] = useState<Where>('city');
  const q = useDebouncedValue(text.trim(), SEARCH_DEBOUNCE_MS);
  // The circle stays where it was put: moving the map afterwards does not move the search.
  const [center, setCenter] = useState<LatLng | null>(null);

  const active = q.length >= MIN_QUERY || category !== '';
  const query: LostSearchQuery = {
    q: q || undefined,
    category: category || undefined,
    near:
      where !== 'city' && center ? `${center.lat.toFixed(5)},${center.lng.toFixed(5)}` : undefined,
    radius_m: where !== 'city' && center ? where : undefined,
    lost_on: lostOn || undefined,
  };
  const results = useLostSearch(query, active);

  const chooseWhere = (value: string) => {
    const next = value === 'city' ? 'city' : (Number(value) as LostRadius);
    const point = next === 'city' ? null : (viewport?.center ?? null);
    setWhere(next);
    setCenter(point);
    onArea(next !== 'city' && point ? { center: point, radiusM: next } : null);
  };

  const clear = () => {
    setText('');
    setCategory('');
    setLostOn('');
    chooseWhere('city');
  };

  const fileLost = () => {
    const params = new URLSearchParams({ kind: 'lost' });
    if (text.trim()) params.set('title', text.trim());
    if (category) params.set('category', category);
    if (lostOn) params.set('on', lostOn);
    requireAuth(() => navigate(`/lost/new?${params.toString()}`), 'чтобы подать объявление');
  };

  return (
    <section className="flex flex-col gap-3 rounded-card border border-line/70 bg-canvas/60 p-3">
      <div className="flex items-start gap-2">
        {/* The title is the fold row above the form (LostPanel). */}
        <p className="min-w-0 flex-1 text-xs text-ink-soft">
          Скажите, что потеряли, где и когда — подберём похожее среди находок.
        </p>
        {(active || lostOn || where !== 'city') && (
          <IconButton icon={X} label="Очистить поиск" size="sm" onClick={clear} />
        )}
      </div>
      <Input
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Что потеряли: «чёрный кошелёк», «ключи с брелоком»"
        aria-label="Что потеряли"
        maxLength={200}
      />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Что это" htmlFor="lost-search-category">
          <Select
            id="lost-search-category"
            value={category}
            onChange={(event) => setCategory(event.target.value as LostCategory | '')}
            placeholder="Любое"
            options={LOST_CATEGORIES.map((value) => ({
              value,
              label: LOST_CATEGORY_META[value].label,
            }))}
          />
        </Field>
        <Field label="Когда" htmlFor="lost-search-day">
          <Input
            id="lost-search-day"
            type="date"
            value={lostOn}
            max={toDayValue(new Date())}
            onChange={(event) => setLostOn(event.target.value)}
          />
        </Field>
      </div>
      <Field
        label="Где"
        htmlFor="lost-search-where"
        hint={
          where !== 'city'
            ? 'Передвиньте карту и выберите радиус снова, чтобы искать в другом месте.'
            : undefined
        }
      >
        <Select
          id="lost-search-where"
          value={String(where)}
          onChange={(event) => chooseWhere(event.target.value)}
          options={WHERE_OPTIONS}
        />
      </Field>

      {active && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-ink">Подходящие находки</h3>
          {results.isPending ? (
            <ListSkeleton rows={2} />
          ) : results.data && results.data.length > 0 ? (
            results.data.map((match) => (
              <LostCard key={match.item.id} item={match.item} reason={match.reason} />
            ))
          ) : (
            <p className="text-sm text-ink-soft">
              {results.isError ? 'Не получилось поискать.' : 'Похожих находок пока нет.'}
            </p>
          )}
          <Button variant="secondary" icon={Megaphone} onClick={fileLost}>
            Подать объявление «Потерял»
          </Button>
          <p className="text-xs text-ink-faint">
            Как только кто-то опубликует похожую находку, придёт уведомление.
          </p>
        </div>
      )}
    </section>
  );
}
