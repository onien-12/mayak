import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { toLngLat, type LatLng } from '@/shared/lib/geo';

import { useMap } from './mapContext';

interface MapHtmlMarkerProps {
  position: LatLng;
  /** Pixel offset of the "tip" from the top-left corner of the content. */
  anchor: [x: number, y: number];
  zIndex?: number;
  /** Let clicks and drags pass through to the map. */
  passive?: boolean;
  children: ReactNode;
}

/** Declarative MapGL `HtmlMarker`: renders React children at a geographic position. */
export function MapHtmlMarker({
  position,
  anchor,
  zIndex = 10,
  passive = false,
  children,
}: MapHtmlMarkerProps) {
  const { map, api } = useMap();
  const [element] = useState(() => {
    const node = document.createElement('div');
    node.dataset.mapMarker = 'custom';
    return node;
  });
  const { lat, lng } = position;
  const [anchorX, anchorY] = anchor;

  useEffect(() => {
    if (!map || !api) return;
    const marker = new api.HtmlMarker(map, {
      coordinates: toLngLat({ lat, lng }),
      html: element,
      anchor: [anchorX, anchorY],
      zIndex,
      interactive: !passive,
      preventMapInteractions: false,
    });
    return () => marker.destroy();
  }, [map, api, element, lat, lng, anchorX, anchorY, zIndex, passive]);

  return createPortal(children, element);
}
