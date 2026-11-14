import { useCallback, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { MapTapPin, usePlaceParam } from '@/features/map';
import type { Category, Layer, PlaceDetail } from '@/shared/api';
import { useCategories } from '@/shared/hooks';
import type { LatLng } from '@/shared/lib/geo';
import { LAYER_META } from '@/shared/lib/labels';
import { ErrorState, PanelLayout, Skeleton, useHonestyPledge } from '@/shared/ui';

import { usePlace } from '../card/usePlace';
import { CategoryStep } from './CategoryStep';
import { DetailsStep } from './DetailsStep';
import { DoneStep } from './DoneStep';
import { usePlaceEditor, type PlaceEditorPreset } from './editorStore';
import { LayerStep } from './LayerStep';
import { emptyValues, valuesFromPlace, type PlaceFormValues } from './placeForm';
import { PointStep } from './PointStep';
import { isAtVenue, type Venue } from './venue';
import type { StepFrame } from './StepFrame';

type Step = 'layer' | 'category' | 'point' | 'details';

interface WizardState {
  step: Step;
  layer: Layer | undefined;
  category: Category | undefined;
  point: LatLng | undefined;
  address: string | undefined;
  /** An existing place the event is held at: preset from its card or picked on the point step. */
  venue: Venue | undefined;
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
      venue: undefined,
    };
  }
  const afterCategory: Step = preset.point ? 'details' : 'point';
  return {
    step: !preset.layer ? 'layer' : preset.categorySlug ? afterCategory : 'category',
    layer: preset.layer,
    category: undefined,
    point: preset.point,
    address: preset.address,
    venue:
      preset.venuePlaceId !== undefined && preset.point
        ? { id: preset.venuePlaceId, title: preset.venueTitle ?? '', ...preset.point }
        : undefined,
  };
}

/** The four-step flow: layer → category → point → details, then a success state. */
function Wizard({ preset, editing }: WizardProps) {
  const close = usePlaceEditor((state) => state.close);
  const { openPlace } = usePlaceParam();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const [state, setState] = useState(() => initialState(preset, editing));
  const [saved, setSaved] = useState<PlaceDetail>();
  const [defaults] = useState<PlaceFormValues>(() =>
    editing ? valuesFromPlace(editing) : emptyValues(preset),
  );
  const { categories, isLoading: categoriesLoading } = useCategories();
  // Kept by the wizard, not the details step: going back to the point does not reset it.
  const pledge = useHonestyPledge();
  // A format chosen up front stands in for the category step until the author picks another.
  const presetCategory = preset.categorySlug
    ? categories.find((item) => item.slug === preset.categorySlug && item.layer === preset.layer)
    : undefined;
  const category = state.category ?? presetCategory;
  const { step, layer, point, venue } = state;

  const openSaved = useCallback(() => {
    // The main map does not draw problems: a new one opens in «Проблемы» (not over its
    // outages view, `?show=outages`, where residents' problems are not drawn either).
    const elsewhere = pathname !== '/problems' || search.includes('show=outages');
    if (saved?.layer === 'issue' && !editing && elsewhere) {
      void navigate(`/problems?place=${saved.id}`);
    } else if (saved) openPlace(saved.id);
    close();
  }, [saved, editing, pathname, search, navigate, openPlace, close]);

  if (saved) return <DoneStep place={saved} edited={Boolean(editing)} onOpen={openSaved} />;

  const go = (next: Step) => setState((current) => ({ ...current, step: next }));
  const skipsCategory = Boolean(presetCategory) && !state.category;
  const back: Record<Step, () => void> = {
    layer: close,
    category: editing ? () => go('details') : preset.layer ? close : () => go('layer'),
    point:
      category && state.point && editing
        ? () => go('details')
        : skipsCategory
          ? close
          : () => go('category'),
    details: editing
      ? close
      : preset.point
        ? skipsCategory
          ? close
          : () => go('category')
        : () => go('point'),
  };
  const first = back[step] === close;
  const frame = (title: string, subtitle?: string): StepFrame => ({
    title,
    subtitle,
    onBack: back[step],
    backLabel: first ? 'Закрыть' : 'Назад',
  });
  const venueSubtitle = venue?.title ? `Встреча: ${venue.title}` : undefined;
  // The chosen point stays marked on the map through every step but its own picker; an edited
  // place has its own marker there.
  const pin = point && !editing && <MapTapPin position={point} />;

  if (step === 'layer' || !layer) {
    return (
      <PanelLayout {...frame('Что добавим?', 'Выберите, о чём хотите рассказать')}>
        {pin}
        <LayerStep
          onPick={(picked) =>
            setState({ ...state, layer: picked, category: undefined, step: 'category' })
          }
        />
      </PanelLayout>
    );
  }

  if (step !== 'category' && !category && preset.categorySlug && categoriesLoading) {
    return (
      <PanelLayout {...frame('Загружаем…')}>
        <Skeleton className="h-64 rounded-card" />
      </PanelLayout>
    );
  }

  if (step === 'category' || !category) {
    return (
      <PanelLayout {...frame('Категория', venueSubtitle ?? LAYER_META[layer].createTitle)}>
        {pin}
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
          setState({
            ...state,
            point: picked,
            address,
            // A point moved away from the venue is no longer at it.
            venue: venue && isAtVenue(picked, venue) ? venue : undefined,
            step: 'details',
          })
        }
        // A meetup may be held at a venue someone offers nearby (SPEC §3.4).
        onPickVenue={
          layer === 'event' && !editing
            ? (picked) =>
                setState({
                  ...state,
                  point: { lat: picked.lat, lng: picked.lng },
                  address: picked.address ?? undefined,
                  venue: { id: picked.id, title: picked.title, lat: picked.lat, lng: picked.lng },
                  step: 'details',
                })
            : undefined
        }
      />
    );
  }

  return (
    <>
      {pin}
      <DetailsStep
        key={`${category.id}:${point.lat}:${point.lng}`}
        frame={frame(editing ? 'Редактирование' : 'Последний шаг', venueSubtitle ?? category.name)}
        draft={{
          layer,
          category,
          point,
          venuePlaceId: venue?.id ?? editing?.event?.venue_place_id ?? undefined,
        }}
        presetAreaId={preset.areaId}
        editing={editing}
        pledge={editing ? undefined : pledge}
        defaultValues={
          state.address && !editing ? { ...defaults, address: state.address } : defaults
        }
        onChangeCategory={() => go('category')}
        onChangePoint={() => go('point')}
        onSaved={setSaved}
      />
    </>
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
