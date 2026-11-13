import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { useMap } from '@/features/map';
import { markPressHandled } from '@/shared/lib/pressGuard';
import { fromLngLat, toLngLat, type LatLng } from '@/shared/lib/geo';

/** Movement (px) after which a press becomes a drag instead of a tap. */
const DRAG_THRESHOLD_PX = 6;

interface DraggableMarkerProps {
  position: LatLng;
  /** Pixel offset of the point from the top-left corner of the content. */
  anchor: [x: number, y: number];
  zIndex?: number;
  label: string;
  onTap: () => void;
  onDragEnd: (point: LatLng) => void;
  children: ReactNode;
}

/**
 * HTML marker that can be dragged with a finger or the mouse (pointer events; the map does
 * not pan while the marker is held). A short press is a tap. Enter / Space also tap.
 */
export function DraggableMarker({
  position,
  anchor,
  zIndex = 30,
  label,
  onTap,
  onDragEnd,
  children,
}: DraggableMarkerProps) {
  const { map, api } = useMap();
  const [element] = useState(() => {
    const node = document.createElement('div');
    node.dataset.mapMarker = 'custom';
    return node;
  });
  const marker = useRef<InstanceType<NonNullable<typeof api>['HtmlMarker']> | null>(null);
  const coordinates = useRef(toLngLat(position));
  const [dragging, setDragging] = useState(false);
  const [anchorX, anchorY] = anchor;
  const { lat, lng } = position;

  useEffect(() => {
    if (!map || !api) return;
    const created = new api.HtmlMarker(map, {
      coordinates: coordinates.current,
      html: element,
      anchor: [anchorX, anchorY],
      interactive: true,
      preventMapInteractions: true,
    });
    marker.current = created;
    return () => {
      created.destroy();
      marker.current = null;
    };
  }, [map, api, element, anchorX, anchorY]);

  useEffect(() => {
    coordinates.current = toLngLat({ lat, lng });
    marker.current?.setCoordinates(coordinates.current);
  }, [lat, lng]);

  useEffect(() => {
    marker.current?.setZIndex(zIndex);
  }, [zIndex, map, api]);

  const tap = useEffectEvent(() => onTap());
  const drop = useEffectEvent((point: LatLng) => onDragEnd(point));

  useEffect(() => {
    if (!map) return;
    let start: { x: number; y: number; id: number } | null = null;
    let moved = false;

    const toPoint = (event: PointerEvent): LatLng => {
      const rect = map.getContainer().getBoundingClientRect();
      return fromLngLat(map.unproject([event.clientX - rect.left, event.clientY - rect.top]));
    };

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      start = { x: event.clientX, y: event.clientY, id: event.pointerId };
      moved = false;
      element.setPointerCapture(event.pointerId);
    };
    const onMove = (event: PointerEvent) => {
      if (!start || event.pointerId !== start.id) return;
      const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
      if (!moved && distance < DRAG_THRESHOLD_PX) return;
      if (!moved) setDragging(true);
      moved = true;
      marker.current?.setCoordinates(toLngLat(toPoint(event)));
    };
    const onUp = (event: PointerEvent) => {
      if (!start || event.pointerId !== start.id) return;
      start = null;
      markPressHandled();
      if (!moved) return;
      setDragging(false);
      drop(toPoint(event));
    };
    // The tap is taken from `click`, not `pointerup`: on touch screens the compatibility
    // click would otherwise land on whatever the tap opened (e.g. a dialog's backdrop).
    const onClick = (event: MouseEvent) => {
      event.stopPropagation();
      if (moved) {
        moved = false;
        return;
      }
      tap();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        tap();
      }
    };

    element.addEventListener('pointerdown', onDown);
    element.addEventListener('pointermove', onMove);
    element.addEventListener('pointerup', onUp);
    element.addEventListener('pointercancel', onUp);
    element.addEventListener('click', onClick);
    element.addEventListener('keydown', onKey);
    return () => {
      element.removeEventListener('pointerdown', onDown);
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerup', onUp);
      element.removeEventListener('pointercancel', onUp);
      element.removeEventListener('click', onClick);
      element.removeEventListener('keydown', onKey);
    };
  }, [map, element]);

  return createPortal(
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      className={`touch-none select-none ${dragging ? 'cursor-grabbing drop-shadow-lg' : 'cursor-grab'}`}
    >
      {children}
    </div>,
    element,
  );
}
