import { useEffect } from 'react';

import { useMapTap } from '@/features/map';
import { useIsDesktop } from '@/shared/hooks';
import type { LatLng } from '@/shared/lib/geo';
import { Button, PanelLayout, SegmentedControl, usePanelStore, useSheetPeek } from '@/shared/ui';

import { CircleMode } from './CircleMode';
import { DrawMode } from './DrawMode';
import { LookupMode } from './LookupMode';
import type { StepFrame } from './StepFrame';
import type { BoundsDraft, BoundsMode } from './useBoundsDraft';

/** Phone: the sheet stays low so the territory and the handles are visible and reachable. */
const BOUNDS_PEEK_PX = 360;

const MODES: readonly { value: BoundsMode; label: string }[] = [
  { value: 'lookup', label: 'Найти' },
  { value: 'draw', label: 'Нарисовать' },
  { value: 'circle', label: 'Круг' },
];

interface BoundsStepProps {
  frame: StepFrame;
  draft: BoundsDraft;
  objectId: string | undefined;
  initialText: string;
  point: LatLng | undefined;
  onNext: () => void;
}

/** Step 1 «Границы»: find the boundary automatically, draw it, or a quick circle. */
export function BoundsStep({
  frame,
  draft,
  objectId,
  initialText,
  point,
  onNext,
}: BoundsStepProps) {
  const isDesktop = useIsDesktop();
  const showMap = usePanelStore((state) => state.showMap);
  useSheetPeek(isDesktop ? null : BOUNDS_PEEK_PX);
  useEffect(() => showMap(), [showMap]);
  useMapTap(() => undefined, draft.mode === 'lookup', { capture: true });

  return (
    <PanelLayout
      {...frame}
      toolbar={
        <SegmentedControl
          label="Как задать границы"
          value={draft.mode}
          onChange={draft.setMode}
          options={MODES}
        />
      }
      footer={
        <Button block size="lg" disabled={!draft.geometry} onClick={onNext}>
          Дальше: о локации
        </Button>
      }
    >
      {draft.mode === 'lookup' && (
        <LookupMode draft={draft} objectId={objectId} initialText={initialText} near={point} />
      )}
      {draft.mode === 'draw' && <DrawMode outline={draft.outline} />}
      {draft.mode === 'circle' && <CircleMode draft={draft} initial={point} />}
    </PanelLayout>
  );
}
