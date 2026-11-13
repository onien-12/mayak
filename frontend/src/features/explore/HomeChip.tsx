import { House } from 'lucide-react';

import { useMapActions } from '@/features/map';
import { useHomeArea } from '@/features/profile';
import { Chip } from '@/shared/ui';

const HOME_ZOOM = 15;

/** «Мой район»: flies to the user's home area; hidden when no home is set. */
export function HomeChip({ className }: { className?: string }) {
  const home = useHomeArea();
  const { flyTo } = useMapActions();
  if (!home) return null;

  return (
    <Chip icon={House} onClick={() => flyTo(home, { minZoom: HOME_ZOOM })} className={className}>
      Мой район
    </Chip>
  );
}
