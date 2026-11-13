import { useCallback, useState } from 'react';

import { usePlaceParam } from '@/features/map';
import type { Category, Layer, PlaceDetail } from '@/shared/api';
import type { LatLng } from '@/shared/lib/geo';
import { LAYER_META } from '@/shared/lib/labels';
import { ErrorState, PanelLayout, Skeleton } from '@/shared/ui';

import { usePlace } from '../card/usePlace';
import { CategoryStep } from './CategoryStep';
import { DetailsStep } from './DetailsStep';
import { DoneStep } from './DoneStep';
import { usePlaceEditor, type PlaceEditorPreset } from './editorStore';
import { LayerStep } from './LayerStep';
import { emptyValues, valuesFromPlace, type PlaceFormValues } from './placeForm';
import { PointStep } from './PointStep';
import type { StepFrame } from './StepFrame';

type Step = 'layer' | 'category' | 'point' | 'details';

interface WizardState {
  step: Step;
  layer: Layer | undefined;
  category: Category | undefined;
  point: LatLng | undefined;
  address: string | undefined;
}

interface WizardProps {
  preset: PlaceEditorPreset;
  /** The place being edited; `undefined` when creating. */
  editing: PlaceDetail | undefined;
}

function initialState(preset: PlaceEditorPreset, editing: PlaceDetail | undefined): WizardState {
  if (editing) {
    return {
      step: 'details',
      layer: editing.layer,
      category: editing.category,
      point: { lat: editing.lat, lng: editing.lng },
      address: editing.address ?? undefined,
    };
  }
  return {
    step: preset.layer ? 'category' : 'layer',
    layer: preset.layer,
    category: undefined,
    point: preset.point,
    address: preset.address,
  };
}

/** The four-step flow: layer → category → point → details, then a success state. */
function Wizard({ preset, editing }: WizardProps) {
  const close = usePlaceEditor((state) => state.close);
  const { openPlace } = usePlaceParam();
  const [state, setState] = useState(() => initialState(preset, editing));
  const [saved, setSaved] = useState<PlaceDetail>();
  const [defaults] = useState<PlaceFormValues>(() =>
    editing ? valuesFromPlace(editing) : emptyValues(preset),
  );
  const { step, layer, category, point } = state;

  const openSaved = useCallback(() => {
    if (saved) openPlace(saved.id);
    close();
  }, [saved, openPlace, close]);

  if (saved) return <DoneStep place={saved} edited={Boolean(editing)} onOpen={openSaved} />;

  const go = (next: Step) => setState((current) => ({ ...current, step: next }));
  const back: Record<Step, () => void> = {
    layer: close,
    category: editing ? () => go('details') : preset.layer ? close : () => go('layer'),
    point: category && state.point && editing ? () => go('details') : () => go('category'),
    details: editing ? close : () => go(preset.point ? 'category' : 'point'),
  };
  const first = back[step] === close;
  const frame = (title: string, subtitle?: string): StepFrame => ({
    title,
    subtitle,
    onBack: back[step],
    backLabel: first ? 'Закрыть' : 'Назад',
  });
  const venue = preset.venueTitle ? `Встреча: ${preset.venueTitle}` : undefined;

  if (step === 'layer' || !layer) {
    return (
      <PanelLayout {...frame('Что добавим?', 'Выберите, о чём хотите рассказать')}>
        <LayerStep
          onPick={(picked) =>
            setState({ ...state, layer: picked, category: undefined, step: 'category' })
          }
        />
      </PanelLayout>
    );
  }

  if (step === 'category' || !category) {
    return (
      <PanelLayout {...frame('Категория', venue ?? LAYER_META[layer].createTitle)}>
        <CategoryStep
          layer={layer}
          selectedId={category?.id}
          onPick={(picked) =>
            setState({ ...state, category: picked, step: state.point ? 'details' : 'point' })
          }
        />
      </PanelLayout>
    );
  }

  if (step === 'point' || !point) {
    return (
      <PointStep
        frame={frame('Где это?', category.name)}
        initial={point ?? preset.pointHint}
        onConfirm={(picked, address) =>
          setState({ ...state, point: picked, address, step: 'details' })
        }
      />
    );
  }

  return (
    <DetailsStep
      key={`${category.id}:${point.lat}:${point.lng}`}
      frame={frame(editing ? 'Редактирование' : 'Последний шаг', venue ?? category.name)}
      draft={{
        layer,
        category,
        point,
        venuePlaceId: preset.venuePlaceId ?? editing?.event?.venue_place_id ?? undefined,
      }}
      presetAreaId={preset.areaId}
      editing={editing}
      defaultValues={state.address && !editing ? { ...defaults, address: state.address } : defaults}
      onChangeCategory={() => go('category')}
      onChangePoint={() => go('point')}
      onSaved={setSaved}
    />
  );
}

function EditLoader({ placeId }: { placeId: number }) {
  const close = usePlaceEditor((state) => state.close);
  const { data: place, isError, error, refetch } = usePlace(placeId);

  if (place) return <Wizard preset={{}} editing={place} />;

  return (
    <PanelLayout title="Редактирование" onBack={close} backLabel="Закрыть">
      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <Skeleton className="h-72 rounded-card" />
      )}
    </PanelLayout>
  );
}

/** Create / edit flow, pushed by the shell on top of the current panel section. */
export function PlaceEditorPanel() {
  const session = usePlaceEditor((state) => state.session);
  if (!session) return null;
  return session.mode === 'edit' ? (
    <EditLoader placeId={session.placeId} />
  ) : (
    <Wizard preset={session.preset} editing={undefined} />
  );
}
