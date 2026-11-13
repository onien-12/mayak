import { useState } from 'react';

import { MapDragHandle, MapPolygon, useMapTap } from '@/features/map';
import type { GeoPosition } from '@/shared/api';
import { cn } from '@/shared/lib/cn';

import { midpoint, MIN_VERTICES, outlineGeometry, toPosition } from '../lib/geometry';
import type { Outline } from './useOutline';

export const DRAW_COLOR = '#2F5D8A';

interface Drag {
  index: number;
  position: GeoPosition;
}

const latLng = ([lng, lat]: GeoPosition) => ({ lat, lng });

/**
 * The drawing surface on the map: a tap adds a vertex, a vertex can be dragged, tapped
 * (select) or held (delete); a tap on an edge's midpoint inserts a vertex there. The fill
 * follows the finger while dragging.
 */
export function DrawLayer({ outline }: { outline: Outline }) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const { vertices, selected } = outline;
  const shown = drag ? vertices.with(drag.index, drag.position) : vertices;
  const closed = shown.length >= MIN_VERTICES;

  useMapTap((tap) => outline.add(toPosition(tap)), true, { capture: true });

  return (
    <>
      {closed && (
        <MapPolygon
          geometry={outlineGeometry(shown)}
          color={DRAW_COLOR}
          fillOpacity={0.2}
          strokeOpacity={0.95}
          strokeWidth={2.5}
          zIndex={4}
        />
      )}
      {closed &&
        shown.map((vertex, index) => {
          const next = shown[(index + 1) % shown.length]!;
          return (
            <MapDragHandle
              key={`mid-${index}`}
              position={latLng(midpoint(vertex, next))}
              label={`Добавить точку между ${index + 1} и ${((index + 1) % shown.length) + 1}`}
              onTap={() => outline.insert(index + 1, midpoint(vertex, next))}
              onDragEnd={(point) => outline.insert(index + 1, toPosition(point))}
              zIndex={41}
            >
              <span className="size-3 rounded-full border-2 border-white bg-[#2F5D8A]/55 shadow-pin" />
            </MapDragHandle>
          );
        })}
      {vertices.map((vertex, index) => (
        <MapDragHandle
          key={`vertex-${index}`}
          position={latLng(vertex)}
          label={`Точка ${index + 1} из ${vertices.length}`}
          onDrag={(point) => setDrag({ index, position: toPosition(point) })}
          onDragEnd={(point) => {
            setDrag(null);
            outline.move(index, toPosition(point));
          }}
          onTap={() => outline.select(selected === index ? null : index)}
          onLongPress={() => outline.remove(index)}
          zIndex={42}
        >
          <span
            className={cn(
              'rounded-full border-[2.5px] shadow-pin transition-transform duration-150',
              selected === index
                ? 'size-5 border-brand bg-beam'
                : 'size-4 border-white bg-[#2F5D8A]',
              index === 0 && selected !== index && 'ring-2 ring-[#2F5D8A]/40 ring-offset-1',
            )}
          />
        </MapDragHandle>
      ))}
    </>
  );
}
