import { toast } from '@/shared/ui';

import { useVisibleCenter } from '../../lib/visibleCenter';
import { PlacementPrompt } from '../../ui/PlacementPrompt';
import { useQuestEditorStore } from './store';

/** The «Старт» tool is on: where players gather, by a tap or in the middle of the map. */
export function StartPrompt() {
  const tool = useQuestEditorStore((state) => state.tool);
  const visibleCenter = useVisibleCenter();
  if (tool !== 'start') return null;
  const { setMeta, setTool } = useQuestEditorStore.getState();
  return (
    <PlacementPrompt
      text="Нажмите на карту — там будет старт квеста"
      onCenter={() => {
        const point = visibleCenter([]);
        if (!point) return;
        setMeta({ start: point });
        setTool('stage');
        toast.success('Старт отмечен — его можно перетащить');
      }}
      onCancel={() => setTool('stage')}
    />
  );
}
