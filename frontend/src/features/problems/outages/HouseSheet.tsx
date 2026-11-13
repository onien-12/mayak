import { ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { usePlaceParam } from '@/features/map';
import type { OutageBuildingPoint } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { pluralize, PLURALS } from '@/shared/lib/format';
import { OUTAGE_RESOURCE_META } from '@/shared/lib/labels';
import { TONES } from '@/shared/lib/tones';
import { Modal } from '@/shared/ui';

import { formatPlannedEnd } from './outageText';
import { useOutageDetails, type OutagePlace } from './useOutages';

interface HouseSheetProps {
  house: OutageBuildingPoint | null;
  onClose: () => void;
  outages: readonly OutagePlace[];
}

/**
 * A tapped house dot: its address and every outage affecting it → the outage card. Keeps
 * showing the last house while the sheet animates out; the planned ends of its outages are
 * loaded for that house only.
 */
export function HouseSheet({ house, onClose, outages }: HouseSheetProps) {
  const { openPlace } = usePlaceParam();
  const [shown, setShown] = useState(house);
  if (house && house !== shown) setShown(house);
  const affecting = outages.filter((place) => shown?.place_ids.includes(place.id));
  const details = useOutageDetails(affecting.map(({ id }) => id));

  return (
    <Modal
      open={house !== null}
      onClose={onClose}
      size="sm"
      title={shown?.address ?? ''}
      description={shown && `Сейчас: ${pluralize(shown.place_ids.length, PLURALS.outage)}`}
    >
      <ul className="-mx-2 flex flex-col">
        {affecting.map((place) => {
          const meta = OUTAGE_RESOURCE_META[place.issue.outage.resource];
          const Icon = meta.icon;
          const plannedEnd = details.get(place.id)?.issue?.expected_fix_at;
          return (
            <li key={place.id}>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  openPlace(place.id);
                }}
                className="flex min-h-14 w-full items-center gap-3 rounded-control px-2 py-2 text-left transition-colors hover:bg-canvas active:bg-canvas"
              >
                <span
                  className={cn(
                    'flex size-10 shrink-0 items-center justify-center rounded-xl',
                    TONES[meta.tone].soft,
                  )}
                >
                  <Icon size={19} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">{meta.missing}</span>
                  <span className="block truncate text-xs text-ink-soft">
                    {plannedEnd ? formatPlannedEnd(plannedEnd).text : place.title}
                  </span>
                </span>
                <ChevronRight size={18} aria-hidden className="shrink-0 text-ink-faint" />
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
