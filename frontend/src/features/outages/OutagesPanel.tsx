import { useState } from 'react';

import { useMapPlaces } from '@/features/map';
import type { OutageBuildingPoint } from '@/shared/api';
import { formatNumber, formatRelative, plural, PLURALS } from '@/shared/lib/format';
import type { LatLng } from '@/shared/lib/geo';
import { ErrorState, ListSkeleton, PanelLayout, usePanelSection } from '@/shared/ui';

import { AddressCheck } from './AddressCheck';
import { HouseSheet } from './HouseSheet';
import { OutageList } from './OutageList';
import { CheckedHouseMarker, HouseDotsLayer } from './OutageMapLayers';
import { AllClear, StaleNotice, SummarySkeleton } from './OutagesStates';
import { OutagesSummary } from './OutagesSummary';
import { isStale } from './outageText';
import { useEntryFrame } from './useEntryFrame';
import { useHouseDots } from './useHouseDots';
import { useOutageList, useOutageSummary } from './useOutages';
import { useResourceFilter } from './useResourceFilter';

/**
 * «Отключения»: live water / heat / electricity outages imported from VL.ru — totals by
 * resource, «проверить адрес», the list of outages and every affected house on the map.
 */
export default function OutagesPanel() {
  const { resource, toggle } = useResourceFilter();
  const summary = useOutageSummary();
  const list = useOutageList(resource);
  const dots = useHouseDots(resource);
  const { covered } = usePanelSection();
  const [house, setHouse] = useState<OutageBuildingPoint | null>(null);
  const [checkedHouse, setCheckedHouse] = useState<LatLng | null>(null);
  useMapPlaces(list.isPending ? undefined : list.filtered);
  useEntryFrame(list.isPending ? undefined : list.outages);

  const data = summary.data;
  const subtitle = data
    ? [
        `${formatNumber(data.totals.buildings)} ${plural(data.totals.buildings, PLURALS.address)}`,
        data.updated_at && `обновлено ${formatRelative(data.updated_at)}`,
      ]
        .filter(Boolean)
        .join(' · ')
    : 'Вода, тепло и свет по данным VL.ru';

  const body = () => {
    if (summary.isPending) return <SummarySkeleton />;
    if (summary.isError) {
      return <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />;
    }
    if (summary.data.totals.outages === 0) return <AllClear summary={summary.data} />;
    return (
      <>
        {isStale(summary.data) && <StaleNotice summary={summary.data} />}
        <OutagesSummary summary={summary.data} resource={resource} onToggle={toggle} />
        <AddressCheck onPick={setCheckedHouse} />
        {list.isPending ? (
          <ListSkeleton rows={3} />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : (
          <OutageList outages={list.filtered} details={list.details} resource={resource} />
        )}
      </>
    );
  };

  return (
    <>
      {!covered && <HouseDotsLayer dots={dots} onHouse={setHouse} />}
      {checkedHouse && <CheckedHouseMarker position={checkedHouse} />}
      <PanelLayout title="Отключения" subtitle={subtitle}>
        <div className="flex flex-col gap-5">{body()}</div>
      </PanelLayout>
      <HouseSheet
        house={house}
        onClose={() => setHouse(null)}
        outages={list.outages}
        details={list.details}
      />
    </>
  );
}
