import { Megaphone } from 'lucide-react';
import { useMemo } from 'react';

import { useMapPlaces } from '@/features/map';
import type { PlaceCard } from '@/shared/api';
import { Button, PanelLayout, SegmentedControl, Spinner } from '@/shared/ui';

import { OutageHouses } from './outages/OutageMapLayers';
import { OutagesGlance } from './outages/OutagesGlance';
import { outagesSubtitle } from './outages/outageText';
import { OutagesView } from './outages/OutagesView';
import { useEntryFrame } from './outages/useEntryFrame';
import { useOutageList, useOutageSummary } from './outages/useOutages';
import { useResourceFilter } from './outages/useResourceFilter';
import { ResidentProblems } from './ResidentProblems';
import { startReportProblem } from './startReportProblem';
import { useProblemsMode, type ProblemsMode } from './useProblemsMode';
import { useResidentProblems } from './useResidentProblems';

const MODE_OPTIONS: readonly { value: ProblemsMode; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'residents', label: 'От жителей' },
  { value: 'outages', label: 'Отключения' },
];

const SUBTITLES: Record<Exclude<ProblemsMode, 'outages'>, string> = {
  all: 'Отключения и сообщения жителей',
  residents: 'Ямы, свалки, поломки — что заметили соседи',
};

/**
 * «Проблемы»: what is wrong in the city right now — utility outages imported from VL.ru and
 * problems residents report themselves, behind one switch. Both are `issue` places; the main map
 * does not draw them, this section does: residents' problems as pins, outages as pins and house
 * dots, according to the switch. The two kinds never share one list.
 */
export default function ProblemsPanel() {
  const { mode, setMode } = useProblemsMode();
  const { resource, toggle } = useResourceFilter();
  const summary = useOutageSummary();
  const outages = useOutageList(mode === 'outages' ? resource : null);
  const residents = useResidentProblems(mode !== 'outages');

  const pins = useMemo<readonly PlaceCard[] | undefined>(() => {
    const outagePins = outages.isPending ? undefined : outages.filtered;
    if (mode === 'outages') return outagePins;
    if (mode === 'residents') return residents.places;
    return residents.places && outagePins ? [...residents.places, ...outagePins] : undefined;
  }, [mode, outages.isPending, outages.filtered, residents.places]);
  useMapPlaces(pins);
  // Entering «Отключения» with none of them in view frames the part of the city that has them.
  useEntryFrame(mode === 'outages' && !outages.isPending ? outages.outages : undefined);

  const subtitle = mode === 'outages' ? outagesSubtitle(summary.data) : SUBTITLES[mode];
  const refreshing = mode !== 'outages' && residents.isFetching && !residents.isPending;

  return (
    <>
      {mode !== 'residents' && (
        <OutageHouses resource={mode === 'outages' ? resource : null} outages={outages.outages} />
      )}
      <PanelLayout
        title="Проблемы"
        subtitle={subtitle}
        actions={refreshing && <Spinner size={16} className="mr-3" />}
        toolbar={
          <SegmentedControl
            label="Что показать"
            value={mode}
            onChange={setMode}
            options={MODE_OPTIONS}
          />
        }
        footer={
          <Button block icon={Megaphone} onClick={startReportProblem}>
            Сообщить о проблеме
          </Button>
        }
      >
        {mode === 'outages' ? (
          <OutagesView summary={summary} list={outages} resource={resource} onToggle={toggle} />
        ) : (
          <div className="flex flex-col gap-5">
            {mode === 'all' && (
              <OutagesGlance summary={summary} onOpen={() => setMode('outages')} />
            )}
            <ResidentProblems problems={residents} />
          </div>
        )}
      </PanelLayout>
    </>
  );
}
