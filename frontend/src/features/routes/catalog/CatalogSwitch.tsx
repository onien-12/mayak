import { SegmentedControl } from '@/shared/ui';

import { useCatalogView, type CatalogView } from './catalogView';

/** «Маршруты | Квесты» on top of the section. */
export function CatalogSwitch() {
  const [view, setView] = useCatalogView();
  return (
    <SegmentedControl<CatalogView>
      label="Что показать"
      value={view}
      onChange={setView}
      options={[
        { value: 'routes', label: 'Маршруты' },
        { value: 'quests', label: 'Квесты' },
      ]}
    />
  );
}
