import type { UseQueryResult } from '@tanstack/react-query';
import { useState } from 'react';

import type { OutageResource, OutageSummary } from '@/shared/api';
import type { LatLng } from '@/shared/lib/geo';
import { ErrorState, ListSkeleton } from '@/shared/ui';

import { AddressCheck } from './AddressCheck';
import { OutageList } from './OutageList';
import { CheckedHouseMarker } from './OutageMapLayers';
import { AllClear, StaleNotice, SummarySkeleton } from './OutagesStates';
import { OutagesSummary } from './OutagesSummary';
import { isStale } from './outageText';
import { useOutageDetails, type OutageListResult } from './useOutages';

interface OutagesViewProps {
  summary: UseQueryResult<OutageSummary>;
  list: OutageListResult;
  resource: OutageResource | null;
  onToggle: (resource: OutageResource) => void;
}

/**
 * «Отключения» inside «Проблемы»: live water / heat / electricity outages imported from VL.ru —
 * totals by resource, «проверить адрес» and the list of outages. The section owns the map
 * pins and house dots; this view marks the house picked in the address check.
 */
export function OutagesView({ summary, list, resource, onToggle }: OutagesViewProps) {
  const [checkedHouse, setCheckedHouse] = useState<LatLng | null>(null);
  const details = useOutageDetails(list.filtered.map(({ id }) => id));

  const body = () => {
    if (summary.isPending) return <SummarySkeleton />;
    if (summary.isError) {
      return <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />;
    }
    if (summary.data.totals.outages === 0) return <AllClear summary={summary.data} />;
    return (
      <>
        {isStale(summary.data) && <StaleNotice summary={summary.data} />}
        <OutagesSummary summary={summary.data} resource={resource} onToggle={onToggle} />
        <AddressCheck onPick={setCheckedHouse} />
        {list.isPending ? (
          <ListSkeleton rows={3} />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : (
          <OutageList outages={list.filtered} details={details} resource={resource} />
        )}
      </>
    );
  };

  return (
    <>
      {checkedHouse && <CheckedHouseMarker position={checkedHouse} />}
      <div className="flex flex-col gap-5">{body()}</div>
    </>
  );
}
