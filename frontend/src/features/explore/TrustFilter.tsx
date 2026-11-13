import { memo } from 'react';

import { MIN_STATUS_OPTIONS } from '@/shared/lib/labels';
import { SegmentedControl } from '@/shared/ui';

import { useExploreFilters } from './filtersStore';

/**
 * Trust threshold: everything / with confirmations / verified only. Memoised: the explore
 * panel re-renders with every viewport change, and each render of the shared-layout thumb
 * makes `motion` measure the page while the map is moving.
 */
export const TrustFilter = memo(function TrustFilter() {
  const minStatus = useExploreFilters((state) => state.minStatus);
  const setMinStatus = useExploreFilters((state) => state.setMinStatus);
  const hint = MIN_STATUS_OPTIONS.find((option) => option.value === minStatus)?.hint;

  return (
    <section>
      <SegmentedControl
        label="Порог доверия"
        size="sm"
        value={minStatus}
        onChange={setMinStatus}
        options={MIN_STATUS_OPTIONS}
      />
      <p className="mt-1.5 text-xs text-ink-faint">{hint}</p>
    </section>
  );
});
