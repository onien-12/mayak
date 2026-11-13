import type { HtmlMarker } from '@2gis/mapgl/types';
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { markPressHandled } from '@/shared/lib/pressGuard';
import { fromLngLat, toLngLat, type LatLng } from '@/shared/lib/geo';

import { useMap } from './mapContext';

const DRAG_THRESHOLD_PX = 6;
const LONG_PRESS_MS = 550;
const DEFAULT_HIT_PX = 44;

interface Gesture {
  id: number;
  x: number;
  y: number;
  /** Pointer position relative to the handle centre, px. */
  offset: [number, number];
  moved: boolean;
  /** Long press fired — the rest of the gesture is ignored. */
  held: boolean;
  timer: number;
  frame: number;
  point: LatLng;
}

interface MapDragHandleProps {
  position: LatLng;
  /** Accessible name of the handle («Точка 3»). */
  label: string;
  /** While dragging, once per animation frame. */
  onDrag?: (point: LatLng) => void;
  onDragEnd?: (point: LatLng) => void;
  onTap?: () => void;
  /** Press and hold without moving. */
  onLongPress?: () => void;
  /** Square hit area in px (≥ 44 for touch); the visible part is `children`, centred. */
  hitSize?: number;
  zIndex?: number;
  children: ReactNode;
}

/**
 * A map point the user can drag with a finger or a mouse (MapGL markers are not draggable
 * themselves): pointer events on the handle, `map.unproject` for the position, map panning
 * disabled during the drag. Tap and long-press are reported separately.
 */
export function MapDragHandle({
  position,
  label,
  onDrag,
  onDragEnd,
  onTap,
  onLongPress,
  hitSize = DEFAULT_HIT_PX,
  zIndex = 40,
  children,
}: MapDragHandleProps) {
  const { map, api } = useMap();
  const [element] = useState(() => {
    const node = document.createElement('div');
    node.dataset.mapMarker = 'handle';
    node.style.touchAction = 'none';
    return node;
  });
  const markerRef = useRef<HtmlMarker | null>(null);
  const { lat, lng } = position;

  const current = useEffectEvent(() => toLngLat({ lat, lng }));
  const drag = useEffectEvent((point: LatLng) => onDrag?.(point));
  const dragEnd = useEffectEvent((point: LatLng) => onDragEnd?.(point));
  const tap = useEffectEvent(() => onTap?.());
  const longPress = useEffectEvent(() => onLongPress?.());

  useEffect(() => {
    markerRef.current?.setCoordinates(toLngLat({ lat, lng }));
  }, [lat, lng]);

  useEffect(() => {
    if (!map || !api) return;
    const marker = new api.HtmlMarker(map, {
      coordinates: current(),
      html: element,
      anchor: [hitSize / 2, hitSize / 2],
      zIndex,
      interactive: true,
      preventMapInteractions: true,
    });
    markerRef.current = marker;
    let gesture: Gesture | null = null;

    const pointAt = (event: PointerEvent, offset: [number, number]): LatLng => {
      const rect = map.getContainer().getBoundingClientRect();
      return fromLngLat(
        map.unproject([
          event.clientX - rect.left - offset[0],
          event.clientY - rect.top - offset[1],
        ]),
      );
    };

    const finish = () => {
      if (!gesture) return;
      window.clearTimeout(gesture.timer);
      cancelAnimationFrame(gesture.frame);
      map.setOption('disableDragging', false);
      gesture = null;
    };

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0 || gesture) return;
      event.preventDefault();
      event.stopPropagation();
      element.setPointerCapture(event.pointerId);
      const rect = map.getContainer().getBoundingClientRect();
      const [px = 0, py = 0] = map.project(current());
      map.setOption('disableDragging', true);
      gesture = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        offset: [event.clientX - rect.left - px, event.clientY - rect.top - py],
        moved: false,
        held: false,
        timer: window.setTimeout(() => {
          if (!gesture || gesture.moved) return;
          gesture.held = true;
          longPress();
        }, LONG_PRESS_MS),
        frame: 0,
        point: fromLngLat(current()),
      };
    };

    const onMove = (event: PointerEvent) => {
      if (!gesture || event.pointerId !== gesture.id || gesture.held) return;
      event.preventDefault();
      if (!gesture.moved) {
        if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < DRAG_THRESHOLD_PX)
          return;
        gesture.moved = true;
        window.clearTimeout(gesture.timer);
      }
      const point = pointAt(event, gesture.offset);
      gesture.point = point;
      marker.setCoordinates(toLngLat(point));
      cancelAnimationFrame(gesture.frame);
      gesture.frame = requestAnimationFrame(() => drag(point));
    };

    const onUp = (event: PointerEvent) => {
      if (!gesture || event.pointerId !== gesture.id) return;
      const { moved, held, point } = gesture;
      finish();
      markPressHandled();
      if (moved) dragEnd(point);
      else if (!held && event.type === 'pointerup') tap();
    };

    element.addEventListener('pointerdown', onDown);
    element.addEventListener('pointermove', onMove);
    element.addEventListener('pointerup', onUp);
    element.addEventListener('pointercancel', onUp);
    return () => {
      finish();
      element.removeEventListener('pointerdown', onDown);
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerup', onUp);
      element.removeEventListener('pointercancel', onUp);
      marker.destroy();
      markerRef.current = null;
    };
  }, [map, api, element, hitSize, zIndex]);

  return createPortal(
    <div
      role="button"
      aria-label={label}
      style={{ width: hitSize, height: hitSize }}
      className="flex cursor-grab items-center justify-center active:cursor-grabbing"
    >
      {children}
    </div>,
    element,
  );
}
