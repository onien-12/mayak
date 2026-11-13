import { create } from 'zustand';

import type { Layer, PlaceCard } from '@/shared/api';
import type { LngLat } from '@/shared/lib/geo';

/** A marker slot on the map: where it is and the DOM node its pin is rendered into. */
export interface MarkerAnchor {
  id: number;
  layer: Layer;
  coordinates: LngLat;
  element: HTMLDivElement;
}

/** Hides a place while the map is zoomed out (it is represented by an aggregate marker). */
export type FoldPredicate = (place: PlaceCard) => boolean;

/**
 * Display list of the place-marker layer — what the active section asked to draw.
 * It holds references to query results (never a second copy to edit); sections stay the
 * owners of their data through TanStack Query.
 */
interface SceneState {
  sectionPlaces: readonly PlaceCard[];
  /** Places shown on top of the section's list while a card needs them (an open area). */
  extraPlaces: readonly PlaceCard[];
  /** The opened place: drawn even when the section's list does not contain it. */
  focusPlace: PlaceCard | null;
  /** Opt-in folding of the section's places (`useMapPlaces(…, { fold })`). */
  fold: FoldPredicate | null;
  /** The camera is below `PLACE_UNFOLD_ZOOM` — folded places are hidden. */
  zoomedOut: boolean;
  /** Areas whose places stay unfolded at any zoom (multiset: one entry per caller). */
  unfoldedAreaIds: readonly number[];
  /**
   * «Для вас» (SPEC §23.5): drawn even when the section's list lacks them, never folded or
   * clustered away, with a quiet accent on the pin.
   */
  recommended: readonly PlaceCard[];
  recommendedIds: ReadonlySet<number>;
  /** Visible section places + extra places + `focusPlace`, without duplicates. */
  places: readonly PlaceCard[];
  /** Changes identity only when ids or coordinates change — that is when clusters rebuild. */
  anchors: readonly MarkerAnchor[];
  /** Replaces «open the place card» on marker click while set (e.g. a picker in a form). */
  onSelect: ((place: PlaceCard) => void) | null;
  setSectionPlaces: (places: readonly PlaceCard[]) => void;
  setExtraPlaces: (places: readonly PlaceCard[]) => void;
  setOnSelect: (onSelect: ((place: PlaceCard) => void) | null) => void;
  setFocusPlace: (place: PlaceCard | null) => void;
  setRecommended: (places: readonly PlaceCard[]) => void;
  setFold: (fold: FoldPredicate | null) => void;
  setZoomedOut: (zoomedOut: boolean) => void;
  /** Keeps the area's places unfolded; returns the undo. */
  unfoldArea: (areaId: number) => () => void;
}

const geometryKey = (places: readonly PlaceCard[]) =>
  places.map((place) => `${place.id}:${place.lng}:${place.lat}`).join('|');

type Layout = Pick<
  SceneState,
  | 'sectionPlaces'
  | 'extraPlaces'
  | 'focusPlace'
  | 'fold'
  | 'zoomedOut'
  | 'unfoldedAreaIds'
  | 'recommended'
  | 'recommendedIds'
>;

function isVisible(place: PlaceCard, layout: Layout): boolean {
  if (!layout.fold || !layout.zoomedOut || !layout.fold(place)) return true;
  if (layout.recommendedIds.has(place.id)) return true;
  return place.area !== null && layout.unfoldedAreaIds.includes(place.area.id);
}

function merge(layout: Layout): readonly PlaceCard[] {
  const { sectionPlaces, extraPlaces, focusPlace, recommended } = layout;
  const visible = layout.fold
    ? sectionPlaces.filter((place) => isVisible(place, layout))
    : sectionPlaces;
  const added = [...recommended, ...extraPlaces, ...(focusPlace ? [focusPlace] : [])];
  if (added.length === 0) return visible;
  const merged = new Map(visible.map((place) => [place.id, place]));
  for (const place of added) merged.set(place.id, place);
  return [...merged.values()];
}

function createMarkerElement(): HTMLDivElement {
  const element = document.createElement('div');
  element.dataset.mapMarker = 'place';
  return element;
}

/** New anchors for the given places; marker elements of places that stay are reused. */
function createAnchors(
  places: readonly PlaceCard[],
  previous: readonly MarkerAnchor[],
): MarkerAnchor[] {
  const elements = new Map(previous.map((anchor) => [anchor.id, anchor.element]));
  return places.map((place) => ({
    id: place.id,
    layer: place.layer,
    coordinates: [place.lng, place.lat],
    element: elements.get(place.id) ?? createMarkerElement(),
  }));
}

export const useSceneStore = create<SceneState>((set, get) => {
  const update = (patch: Partial<Layout>) => {
    const layout: Layout = { ...get(), ...patch };
    const places = merge(layout);
    const geometryChanged = geometryKey(places) !== geometryKey(get().places);
    set({
      ...patch,
      places,
      anchors: geometryChanged ? createAnchors(places, get().anchors) : get().anchors,
    });
  };

  return {
    sectionPlaces: [],
    extraPlaces: [],
    focusPlace: null,
    fold: null,
    zoomedOut: false,
    unfoldedAreaIds: [],
    recommended: [],
    recommendedIds: new Set(),
    places: [],
    anchors: [],
    onSelect: null,
    setSectionPlaces: (sectionPlaces) => update({ sectionPlaces }),
    setExtraPlaces: (extraPlaces) => update({ extraPlaces }),
    setOnSelect: (onSelect) => set({ onSelect }),
    setFocusPlace: (focusPlace) => update({ focusPlace }),
    setRecommended: (recommended) =>
      update({ recommended, recommendedIds: new Set(recommended.map((place) => place.id)) }),
    setFold: (fold) => update({ fold }),
    setZoomedOut: (zoomedOut) => {
      if (zoomedOut !== get().zoomedOut) update({ zoomedOut });
    },
    unfoldArea: (areaId) => {
      update({ unfoldedAreaIds: [...get().unfoldedAreaIds, areaId] });
      return () => {
        const ids = get().unfoldedAreaIds;
        const index = ids.indexOf(areaId);
        if (index !== -1) update({ unfoldedAreaIds: ids.toSpliced(index, 1) });
      };
    },
  };
});
