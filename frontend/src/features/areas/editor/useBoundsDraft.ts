import { useState } from 'react';

import type { AreaGeometryCandidate, GeoPolygon } from '@/shared/api';
import type { LatLng } from '@/shared/lib/geo';
import { circlePolygon } from '@/shared/lib/polygon';

import { editableVertices, outlineGeometry, outlineProblem, thinVertices } from '../lib/geometry';
import { useOutline } from './useOutline';

/** Best first: a ready boundary from 2GIS / OSM, a hand-drawn outline, a quick circle. */
export type BoundsMode = 'lookup' | 'draw' | 'circle';

export const DEFAULT_RADIUS_M = 250;
/** A circle turned into an outline keeps this many handles. */
const REFINE_VERTICES = 16;

interface BoundsInit {
  mode: BoundsMode;
  geometry?: GeoPolygon;
  radiusM?: number;
}

/** State of the «Границы» step shared by its three modes; switching modes keeps each one. */
export function useBoundsDraft(init: BoundsInit) {
  const [mode, setMode] = useState<BoundsMode>(init.mode);
  const outline = useOutline(init.geometry ? editableVertices(init.geometry) : []);
  const [candidate, setCandidate] = useState<AreaGeometryCandidate | null>(null);
  const [center, setCenter] = useState<LatLng | null>(null);
  const [radiusM, setRadiusM] = useState(init.radiusM ?? DEFAULT_RADIUS_M);
  const [touched, setTouched] = useState(false);

  let geometry: GeoPolygon | null;
  let problem: string | null;
  if (mode === 'lookup') {
    geometry = candidate?.geometry ?? null;
    problem = candidate ? null : 'Выберите один из найденных вариантов';
  } else if (mode === 'draw') {
    problem = outlineProblem(outline.vertices);
    geometry = problem ? null : outlineGeometry(outline.vertices);
  } else {
    geometry = center ? circlePolygon(center, radiusM) : null;
    problem = center ? null : 'Подвиньте карту — центр круга в середине';
  }

  const touch =
    <T>(update: (value: T) => void) =>
    (value: T) => {
      setTouched(true);
      update(value);
    };

  /** Continues by hand from the current boundary (a found one or the circle). */
  const refine = () => {
    const source = mode === 'lookup' ? candidate?.geometry : geometry;
    if (source)
      outline.replace(
        thinVertices(editableVertices(source), mode === 'circle' ? REFINE_VERTICES : Infinity),
      );
    setTouched(true);
    setMode('draw');
  };

  return {
    mode,
    setMode: touch(setMode),
    outline,
    candidate,
    setCandidate: touch(setCandidate),
    center,
    setCenter,
    radiusM,
    setRadiusM: touch(setRadiusM),
    /** The territory to save; `null` while the current mode has nothing valid. */
    geometry,
    problem,
    /** Where the boundary came from — OSM shapes carry an attribution. */
    attribution: mode === 'lookup' ? (candidate?.attribution ?? null) : null,
    /** Editing: geometry is sent only when the user changed something in this step. */
    changed: touched || outline.canUndo,
    refine,
  };
}

export type BoundsDraft = ReturnType<typeof useBoundsDraft>;
