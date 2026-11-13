import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { MessageSquareText } from 'lucide-react';
import { motion } from 'motion/react';
import { useMemo } from 'react';

import {
  CLUSTER_RADIUS_PX,
  MapHtmlMarker,
  UNCLUSTER_ZOOM,
  useMap,
  useMapMarkerPoints,
  useMapViewport,
  useSpotParam,
  type MapTap,
} from '@/features/map';
import { notesApi, queryKeys, type MapNote } from '@/shared/api';
import { useDebouncedValue } from '@/shared/hooks';
import { cn } from '@/shared/lib/cn';
import { pluralize } from '@/shared/lib/format';
import { boundsToBbox, snapBoundsOutward } from '@/shared/lib/geo';
import { SPRING } from '@/shared/ui';

import { useNotesLayer } from './notesLayerStore';
import { NOTE_FORMS } from './useNotes';

/** Bubbles appear only when the map is zoomed in to street level. */
const MIN_ZOOM = 15;
const VIEWPORT_DEBOUNCE_MS = 400;
const MAX_BUBBLES = 150;
/** Grid of ≈ 40 m for notes that are not attached to a 2GIS object. */
const GRID_LAT = 0.00036;
const GRID_LNG = 0.0005;
const BUBBLE = { width: 52, height: 34 };
/** A place pin this close on the screen is «the same spot»: the bubble hangs under it. */
const PIN_REACH_PX = 22;
/** Gap between the pin's tip and a bubble hanging under it. */
const UNDER_PIN_GAP_PX = 4;

interface NoteBubble extends MapTap {
  key: string;
  count: number;
  title: string | null;
}

interface PlacedBubble {
  bubble: NoteBubble;
  /** A place pin stands at this spot: the bubble is drawn below the point, not over the pin. */
  underPin: boolean;
}

/** One bubble per 2GIS object, or per ≈ 40 m cell for notes on plain coordinates. */
function groupNotes(notes: readonly MapNote[]): NoteBubble[] {
  const groups = new Map<string, NoteBubble>();
  for (const note of notes) {
    const key =
      note.object_id ?? `${Math.round(note.lat / GRID_LAT)}:${Math.round(note.lng / GRID_LNG)}`;
    const group = groups.get(key);
    if (group) group.count += 1;
    else
      groups.set(key, {
        key,
        lat: note.lat,
        lng: note.lng,
        objectId: note.object_id ?? undefined,
        count: 1,
        title: note.object_name,
      });
  }
  return [...groups.values()].slice(0, MAX_BUBBLES);
}

interface BubbleProps extends PlacedBubble {
  onOpen: (tap: MapTap) => void;
}

function Bubble({ bubble, underPin, onOpen }: BubbleProps) {
  const label = `${pluralize(bubble.count, NOTE_FORMS)}${bubble.title ? ` — ${bubble.title}` : ''}`;
  return (
    <MapHtmlMarker
      position={bubble}
      anchor={[BUBBLE.width / 2, underPin ? -UNDER_PIN_GAP_PX : BUBBLE.height]}
      zIndex={20}
    >
      <div className="flex w-[52px] justify-center">
        <motion.button
          type="button"
          aria-label={`Открыть: ${label}`}
          title={label}
          initial={{ scale: 0.4, opacity: 0, y: 6 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          whileTap={{ scale: 0.9 }}
          transition={SPRING.pop}
          onClick={() => onOpen(bubble)}
          className={cn(
            'relative flex h-7 items-center gap-1 rounded-full border-2 border-white bg-brand pr-2 pl-1.5 text-xs font-semibold text-white shadow-pin',
            // The tail points at the spot; under a pin there is nothing to point at.
            underPin
              ? 'origin-top'
              : 'origin-bottom after:absolute after:-bottom-[5px] after:left-1/2 after:size-2 after:-translate-x-1/2 after:rotate-45 after:border-r-2 after:border-b-2 after:border-white after:bg-brand',
          )}
        >
          <MessageSquareText size={14} aria-hidden className="text-beam" />
          <span className="tabular-nums">{bubble.count}</span>
        </motion.button>
      </div>
    </MapHtmlMarker>
  );
}

/**
 * Map layer of note bubbles with counters (SPEC §13): fetched by the visible area at street
 * zoom, tap → the spot sheet of that object / point. Mount it in a panel section; the user
 * switches it with `NotesToggle`.
 *
 * Bubbles keep out of the way of places: where places are merged into a count bubble, the
 * notes at that spot are not drawn on top of it (they come back when the map is zoomed in and
 * the cluster opens), and a bubble at a place's own point hangs under its pin.
 */
export function NotesMapLayer() {
  const visible = useNotesLayer((state) => state.visible);
  const viewport = useDebouncedValue(useMapViewport(), VIEWPORT_DEBOUNCE_MS);
  const { openSpot } = useSpotParam();
  const zoomedIn = viewport !== null && viewport.zoom >= MIN_ZOOM;
  const bbox = zoomedIn ? boundsToBbox(snapBoundsOutward(viewport.bounds)) : '';

  const notes = useQuery({
    queryKey: queryKeys.notes.list({ bbox }),
    queryFn: ({ signal }) => notesApi.list({ bbox }, signal),
    enabled: visible && zoomedIn,
    placeholderData: keepPreviousData,
  });
  const bubbles = useMemo(() => groupNotes(notes.data ?? []), [notes.data]);
  const { map } = useMap();
  const places = useMapMarkerPoints();
  const placed = useMemo<PlacedBubble[]>(() => {
    if (!map || !viewport) return bubbles.map((bubble) => ({ bubble, underPin: false }));
    const clustering = viewport.zoom < UNCLUSTER_ZOOM;
    const pins = places.map((point) => map.project(point));
    return bubbles.flatMap((bubble) => {
      const [x = 0, y = 0] = map.project([bubble.lng, bubble.lat]);
      let around = 0;
      let touching = false;
      for (const [pinX = 0, pinY = 0] of pins) {
        const distance = Math.hypot(pinX - x, pinY - y);
        if (distance <= CLUSTER_RADIUS_PX) around += 1;
        if (distance <= PIN_REACH_PX) touching = true;
      }
      // Two or more places this close are one count bubble right now — it stands for the notes too.
      if (clustering && around >= 2) return [];
      return [{ bubble, underPin: touching }];
    });
  }, [bubbles, places, map, viewport]);

  if (!visible || !zoomedIn) return null;

  return (
    <>
      {placed.map(({ bubble, underPin }) => (
        <Bubble key={bubble.key} bubble={bubble} underPin={underPin} onOpen={openSpot} />
      ))}
    </>
  );
}
