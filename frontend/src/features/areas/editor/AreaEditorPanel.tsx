import { useEffect, useEffectEvent, useState } from 'react';

import { useMapActions } from '@/features/map';
import type { AreaDetail } from '@/shared/api';
import { polygonBounds } from '@/shared/lib/polygon';
import { ErrorState, PanelLayout, Skeleton } from '@/shared/ui';

import { useArea } from '../card/useArea';
import { shortPlaceName } from '../lib/geometry';
import { AreaDetailsStep } from './AreaDetailsStep';
import { useAreaEditor, type AreaEditorPreset } from './areaEditorStore';
import { BoundsStep } from './BoundsStep';
import type { StepFrame } from './StepFrame';
import { useBoundsDraft } from './useBoundsDraft';

type Step = 'bounds' | 'details';

interface WizardProps {
  preset: AreaEditorPreset;
  editing: AreaDetail | undefined;
}

/** Puts the camera on the territory being edited (or the preset point) once. */
function useInitialCamera({ preset, editing }: WizardProps): void {
  const { flyTo, fitBounds, ready } = useMapActions();
  const geometry = editing?.geometry ?? preset.geometry;
  const move = useEffectEvent(() => {
    if (geometry) fitBounds(polygonBounds(geometry), { maxZoom: 17, padding: 32 });
    else if (preset.point) flyTo(preset.point, { minZoom: 15 });
  });

  useEffect(() => {
    if (ready) move();
  }, [ready]);
}

/** Territory editor: «Границы» (find / draw / circle) → «О локации». */
function Wizard({ preset, editing }: WizardProps) {
  const close = useAreaEditor((state) => state.close);
  const [step, setStep] = useState<Step>(editing ? 'details' : 'bounds');
  const draft = useBoundsDraft({
    mode: editing || preset.geometry ? 'draw' : 'lookup',
    geometry: editing?.geometry ?? preset.geometry,
    radiusM: preset.radiusM,
  });
  useInitialCamera({ preset, editing });

  const frame = (
    title: string,
    subtitle: string,
    onBack: () => void,
    first: boolean,
  ): StepFrame => ({
    title,
    subtitle,
    onBack,
    backLabel: first ? 'Закрыть' : 'Назад',
  });
  const name = editing ? `«${editing.title}»` : 'Новая локация';

  if (step === 'bounds') {
    return (
      <BoundsStep
        frame={frame('Границы', name, editing ? () => setStep('details') : close, !editing)}
        draft={draft}
        objectId={preset.objectId}
        initialText={preset.title ?? ''}
        point={preset.point}
        onNext={() => setStep('details')}
      />
    );
  }

  return (
    <AreaDetailsStep
      frame={frame(
        editing ? 'Локация' : 'О локации',
        editing ? 'Название, тип, описание и границы' : 'Последний шаг',
        editing ? close : () => setStep('bounds'),
        Boolean(editing),
      )}
      draft={draft}
      editing={editing}
      defaults={{
        title:
          editing?.title ??
          preset.title ??
          (draft.candidate ? shortPlaceName(draft.candidate.title) : ''),
        kind: editing?.kind ?? 'park',
        description: editing?.description ?? '',
      }}
      objectId={preset.objectId}
      onBackToBounds={() => setStep('bounds')}
      onDone={close}
    />
  );
}

function EditLoader({ areaId }: { areaId: number }) {
  const close = useAreaEditor((state) => state.close);
  const { data: area, isError, error, refetch } = useArea(areaId);

  if (area) return <Wizard preset={{}} editing={area} />;

  return (
    <PanelLayout title="Локация" onBack={close} backLabel="Закрыть">
      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <Skeleton className="h-72 rounded-card" />
      )}
    </PanelLayout>
  );
}

/** Create / edit flow of an area, pushed by the shell on top of the current panel. */
export function AreaEditorPanel() {
  const session = useAreaEditor((state) => state.session);
  if (!session) return null;
  return session.mode === 'edit' ? (
    <EditLoader areaId={session.areaId} />
  ) : (
    <Wizard preset={session.preset} editing={undefined} />
  );
}
