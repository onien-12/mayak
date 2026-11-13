import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CircleCheck, Home, Search, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';

import { useMapActions, usePlaceParam } from '@/features/map';
import { outagesApi, queryKeys, type OutageAddressMatch, type PlaceDetail } from '@/shared/api';
import { useDebouncedValue } from '@/shared/hooks';
import type { LatLng } from '@/shared/lib/geo';
import { OUTAGE_RESOURCE_META } from '@/shared/lib/labels';
import { Badge, ErrorState, IconButton, Input, Spinner, StaggerItem, TWEEN } from '@/shared/ui';

import { formatPlannedEnd } from './outageText';
import { useOutageDetails } from './useOutages';

const DEBOUNCE_MS = 450;
const MIN_LENGTH = 3;

interface MatchRowProps {
  match: OutageAddressMatch;
  details: ReadonlyMap<number, PlaceDetail>;
  onPick: () => void;
}

function MatchRow({ match, details, onPick }: MatchRowProps) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex min-h-14 w-full items-center gap-3 rounded-control px-2 py-2 text-left transition-colors hover:bg-canvas active:bg-canvas"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-issue-soft text-issue-ink">
        <Home size={17} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">{match.address}</span>
        <span className="mt-1 flex flex-wrap gap-1">
          {match.outages.map((place) => {
            const resource = place.issue?.outage?.resource;
            if (!resource) return null;
            const meta = OUTAGE_RESOURCE_META[resource];
            const plannedEnd = details.get(place.id)?.issue?.expected_fix_at;
            return (
              <Badge key={place.id} tone={meta.tone} icon={meta.icon}>
                {meta.missing}
                {plannedEnd && ` · ${formatPlannedEnd(plannedEnd).text}`}
              </Badge>
            );
          })}
        </span>
      </span>
    </button>
  );
}

interface AddressCheckProps {
  /** The house the user picked — marked on the map by the panel. */
  onPick: (house: LatLng) => void;
}

/** «Проверить адрес»: free-text address → houses with current outages, or a clear «всё в порядке». */
export function AddressCheck({ onPick }: AddressCheckProps) {
  const [text, setText] = useState('');
  const query = useDebouncedValue(text.trim(), DEBOUNCE_MS);
  const active = query.length >= MIN_LENGTH;
  const { flyTo } = useMapActions();
  const { openPlace } = usePlaceParam();

  const check = useQuery({
    queryKey: queryKeys.outages.check(query),
    queryFn: ({ signal }) => outagesApi.check(query, signal),
    enabled: active,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });

  const details = useOutageDetails(
    (active ? (check.data ?? []) : []).flatMap((match) => match.outages.map(({ id }) => id)),
  );

  const pick = (match: OutageAddressMatch) => {
    onPick(match);
    flyTo(match, { minZoom: 17 });
    const [first] = match.outages;
    if (first) openPlace(first.id);
  };

  return (
    <section aria-label="Проверить адрес" className="rounded-card bg-canvas p-3">
      <h2 className="mb-2 text-sm font-semibold text-ink">Проверить свой адрес</h2>
      <form role="search" onSubmit={(event) => event.preventDefault()}>
        <Input
          type="search"
          enterKeyHint="search"
          icon={Search}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Улица и дом: Некрасовская 48"
          aria-label="Адрес для проверки"
          className="[&::-webkit-search-cancel-button]:hidden"
          trailing={
            check.isFetching && active ? (
              <Spinner size={16} className="mr-2.5" />
            ) : (
              text && <IconButton icon={X} label="Очистить" size="sm" onClick={() => setText('')} />
            )
          }
        />
      </form>
      <AnimatePresence initial={false} mode="wait">
        {active && check.data && (
          <motion.div
            key={check.data.length === 0 ? 'none' : 'found'}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={TWEEN.base}
            className="mt-2"
          >
            {check.data.length === 0 ? (
              <p className="flex items-start gap-2.5 rounded-control bg-success-soft px-3 py-2.5 text-sm text-success-ink">
                <CircleCheck size={18} aria-hidden className="mt-px shrink-0" />
                <span>
                  <span className="block font-semibold">По этому адресу отключений не найдено</span>
                  <span className="text-ink-soft">
                    Если воды или света всё же нет, проверьте написание улицы.
                  </span>
                </span>
              </p>
            ) : (
              <ul className="-mx-1 flex flex-col">
                {check.data.map((match, index) => (
                  <StaggerItem key={match.address} index={index}>
                    <MatchRow match={match} details={details} onPick={() => pick(match)} />
                  </StaggerItem>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      {active && check.isError && (
        <ErrorState error={check.error} onRetry={() => void check.refetch()} className="py-4" />
      )}
    </section>
  );
}
