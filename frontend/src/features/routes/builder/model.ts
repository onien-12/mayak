import {
  ApiError,
  errorMessage,
  type Layer,
  type PathMode,
  type Photo,
  type RouteDetail,
  type RouteDifficulty,
  type RouteInput,
  type RouteKind,
  type RouteVisibility,
  type StopKind,
} from '@/shared/api';
import type { LatLng } from '@/shared/lib/geo';

import { nearestSegment } from '../lib/geometry';

/**
 * The route builder's document: pure data plus pure functions over it. The store applies
 * these; components never reshape stops themselves.
 */

export const MAX_STOPS = 40;
export const MAX_STOP_PHOTOS = 6;
const MAX_TAGS = 8;
const COORD_DIGITS = 5;

export interface LinkedPlace {
  id: number;
  title: string;
  layer: Layer;
}

export interface DraftStop {
  /** Client-side id: stable across reorders, never sent to the API. */
  id: string;
  kind: StopKind;
  title: string;
  lat: number;
  lng: number;
  note: string;
  landmark: string;
  stayMin: number;
  photos: Photo[];
  place: LinkedPlace | null;
  /** 2GIS object under the tap that created the stop — its name is offered as the title. */
  objectId: string | null;
}

export interface RouteDraft {
  title: string;
  description: string;
  tips: string;
  tags: string[];
  kind: RouteKind;
  difficulty: RouteDifficulty | null;
  visibility: RouteVisibility;
  pathMode: PathMode;
  stops: DraftStop[];
}

export type DraftField = 'title' | 'description' | 'tips' | 'tags' | 'stops';
export type DraftErrors = Partial<Record<DraftField, string>>;

export function emptyDraft(): RouteDraft {
  return {
    title: '',
    description: '',
    tips: '',
    tags: [],
    kind: 'walk',
    difficulty: null,
    visibility: 'public',
    pathMode: 'roads',
    stops: [],
  };
}

let sequence = 0;
function newStopId(): string {
  sequence += 1;
  return `stop-${Date.now().toString(36)}-${sequence}`;
}

export function createStop(point: LatLng, fields: Partial<Omit<DraftStop, 'id'>> = {}): DraftStop {
  return {
    kind: 'poi',
    title: '',
    note: '',
    landmark: '',
    stayMin: 0,
    photos: [],
    place: null,
    objectId: null,
    ...fields,
    id: newStopId(),
    lat: point.lat,
    lng: point.lng,
  };
}

export function draftFromRoute(route: RouteDetail): RouteDraft {
  return {
    title: route.title,
    description: route.description,
    tips: route.tips ?? '',
    tags: route.tags,
    kind: route.kind,
    difficulty: route.difficulty,
    visibility: route.visibility,
    pathMode: route.path_mode,
    stops: route.stops.map((stop) =>
      createStop(stop, {
        kind: stop.kind,
        title: stop.title,
        note: stop.note,
        landmark: stop.landmark,
        stayMin: stop.stay_min,
        photos: stop.photos,
        place: stop.place
          ? { id: stop.place.id, title: stop.place.title, layer: stop.place.layer }
          : null,
      }),
    ),
  };
}

export const isVia = (stop: DraftStop) => stop.kind === 'via';

/** Number of a stop among the visible (non-`via`) ones, 1-based; 0 for shaping points. */
export function stopNumber(stops: readonly DraftStop[], id: string): number {
  let number = 0;
  for (const stop of stops) {
    if (!isVia(stop)) number += 1;
    if (stop.id === id) return isVia(stop) ? 0 : number;
  }
  return 0;
}

export function visibleCount(stops: readonly DraftStop[]): number {
  return stops.filter((stop) => !isVia(stop)).length;
}

/** Title shown in lists and sent to the API when the author left it empty. */
export function stopTitle(stop: DraftStop, number: number): string {
  return stop.title.trim() || (isVia(stop) ? 'Точка трека' : `Точка ${number}`);
}

export function insertStop(
  stops: readonly DraftStop[],
  stop: DraftStop,
  index?: number,
): DraftStop[] {
  const at = index === undefined ? stops.length : Math.max(0, Math.min(index, stops.length));
  return [...stops.slice(0, at), stop, ...stops.slice(at)];
}

/** Where a new shaping point belongs: inside the segment of the line it was put next to. */
export function viaInsertIndex(stops: readonly DraftStop[], point: LatLng): number {
  if (stops.length < 2) return stops.length;
  return nearestSegment(stops, point) + 1;
}

export function updateStop(
  stops: readonly DraftStop[],
  id: string,
  patch: Partial<Omit<DraftStop, 'id'>>,
): DraftStop[] {
  return stops.map((stop) => (stop.id === id ? { ...stop, ...patch } : stop));
}

export function removeStop(stops: readonly DraftStop[], id: string) {
  const index = stops.findIndex((stop) => stop.id === id);
  const stop = stops[index];
  if (!stop) return { stops: [...stops], removed: null };
  return { stops: stops.filter((item) => item.id !== id), removed: { stop, index } };
}

/** Applies a new order given as ids (from drag-and-drop). Unknown ids are ignored. */
export function reorderStops(stops: readonly DraftStop[], ids: readonly string[]): DraftStop[] {
  const byId = new Map(stops.map((stop) => [stop.id, stop]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

const round = (value: number) => Number(value.toFixed(COORD_DIGITS));

/** Points for `/routes/preview`, rounded so that the cache key ignores sub-metre jitter. */
export function previewPoints(stops: readonly DraftStop[]): LatLng[] {
  return stops.map((stop) => ({ lat: round(stop.lat), lng: round(stop.lng) }));
}

/**
 * Distance to every visible stop from the previous visible one, summing the legs through
 * shaping points. `legs[i]` is the leg between `stops[i]` and `stops[i + 1]`.
 */
export function legsToVisibleStops(
  stops: readonly DraftStop[],
  legs: readonly number[],
): Map<string, number> {
  const result = new Map<string, number>();
  let pending = 0;
  let seenVisible = false;
  stops.forEach((stop, index) => {
    if (index > 0) pending += legs[index - 1] ?? 0;
    if (isVia(stop)) return;
    if (seenVisible) result.set(stop.id, pending);
    seenVisible = true;
    pending = 0;
  });
  return result;
}

export function validateDraft(draft: RouteDraft): DraftErrors {
  const errors: DraftErrors = {};
  const title = draft.title.trim();
  if (title.length < 3) errors.title = 'Назовите маршрут — хотя бы 3 символа';
  else if (title.length > 120) errors.title = 'Не длиннее 120 символов';
  if (draft.description.length > 5000) errors.description = 'Не длиннее 5000 символов';
  if (draft.tips.length > 2000) errors.tips = 'Не длиннее 2000 символов';
  if (draft.tags.length > MAX_TAGS) errors.tags = `Не больше ${MAX_TAGS} тегов`;
  const stopsError = validateStops(draft.stops);
  if (stopsError) errors.stops = stopsError;
  return errors;
}

/** `null` when the stops can be saved. */
function validateStops(stops: readonly DraftStop[]): string | null {
  if (visibleCount(stops) < 2) return 'Нужно минимум две точки — старт и финиш';
  if (stops.length > MAX_STOPS) return `Не больше ${MAX_STOPS} точек вместе с точками трека`;
  return null;
}

export function toRouteInput(draft: RouteDraft): RouteInput {
  let number = 0;
  return {
    title: draft.title.trim(),
    description: draft.description.trim(),
    kind: draft.kind,
    difficulty: draft.difficulty,
    visibility: draft.visibility,
    path_mode: draft.pathMode,
    tips: draft.tips.trim() || null,
    tags: draft.tags,
    stops: draft.stops.map((stop) => {
      if (!isVia(stop)) number += 1;
      return {
        place_id: stop.place?.id,
        kind: stop.kind,
        title: isVia(stop) ? stop.title.trim() : stopTitle(stop, number),
        lat: stop.lat,
        lng: stop.lng,
        note: stop.note.trim(),
        landmark: stop.landmark.trim(),
        stay_min: stop.stayMin,
        photo_ids: stop.photos.map((photo) => photo.id),
      };
    }),
  };
}

const FIELDS: readonly DraftField[] = ['title', 'description', 'tips', 'tags', 'stops'];

function fieldOf(path: string): DraftField | undefined {
  const [head] = path.split('.');
  return FIELDS.find((name) => name === head);
}

/** 422 field errors → builder fields (`stops.3.title` → `stops`); otherwise a general message. */
export function serverErrors(error: unknown): { errors: DraftErrors; message: string | null } {
  const errors: DraftErrors = {};
  if (error instanceof ApiError) {
    for (const item of error.errors) {
      const field = fieldOf(item.field);
      if (!field || errors[field]) continue;
      const stop = /^stops\.(\d+)/.exec(item.field);
      errors[field] = stop ? `Точка ${Number(stop[1]) + 1}: ${item.message}` : item.message;
    }
  }
  return { errors, message: Object.keys(errors).length > 0 ? null : errorMessage(error) };
}
