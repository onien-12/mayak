import { LandPlot, Plus } from 'lucide-react';

import { requireAuth } from '@/features/auth';
import { useMapViewport } from '@/features/map';
import { Button } from '@/shared/ui';

import { openCreateArea } from '../editor/areaEditorStore';
import { useCanManageAreas } from '../editor/useCanManageAreas';

/**
 * Entry point for trusted users and moderators: turn a park, an embankment or a square
 * into a location. Renders nothing for everyone else.
 */
export function CreateAreaHint() {
  const canManage = useCanManageAreas();
  const viewport = useMapViewport();
  if (!canManage) return null;

  const start = () =>
    requireAuth(() => openCreateArea({ point: viewport?.center }), 'чтобы создать локацию');

  return (
    <div className="flex items-center gap-3 rounded-card border border-dashed border-line p-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-beam-soft text-ink">
        <LandPlot size={19} aria-hidden />
      </span>
      <p className="min-w-0 flex-1 text-sm text-ink-soft">
        Парк, набережная или площадь заслуживают своей карточки?
      </p>
      <Button size="sm" variant="secondary" icon={Plus} onClick={start}>
        Локация
      </Button>
    </div>
  );
}
