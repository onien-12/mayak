import { motion } from 'motion/react';
import { useMemo } from 'react';

import { MapCircle, MapHtmlMarker, useMap, useMapActions, useMapViewport } from '@/features/map';
import type { LostItemCard, LostKind } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { SPRING } from '@/shared/ui';

import { LOST_KIND_META } from './lostMeta';

/** Posts closer than this on the screen merge into one count tile. */
const CLUSTER_RADIUS_PX = 46;
/** From this zoom on, every post has its own pin. */
const UNCLUSTER_ZOOM = 16;
const PIN = 34;
const SELECTED_PIN = 44;
/** Above note bubbles (20) and place pins (30), below the selected place (60). */
const Z_INDEX = 40;

interface Group {
  key: string;
  lat: number;
  lng: number;
  items: LostItemCard[];
}

function kindsOf(items: readonly LostItemCard[]): Record<LostKind, number> {
  const counts: Record<LostKind, number> = { found: 0, lost: 0 };
  for (const item of items) counts[item.kind] += 1;
  return counts;
}

/**
 * A diamond — the shape of «Потеряшки» on the map, so a post never reads as a place pin
 * (a teardrop) or a cluster of places (a navy circle). Green — found, pink — lost.
 */
function Pin({
  item,
  selected,
  onOpen,
}: {
  item: LostItemCard;
  selected: boolean;
  onOpen: (id: number) => void;
}) {
  const meta = LOST_KIND_META[item.kind];
  const Icon = meta.icon;
  const size = selected ? SELECTED_PIN : PIN;
  return (
    <MapHtmlMarker
      position={item}
      anchor={[size / 2, size / 2]}
      zIndex={selected ? Z_INDEX + 5 : Z_INDEX}
    >
      <motion.button
        type="button"
        aria-label={`${meta.label}: ${item.title}`}
        title={`${meta.label}: ${item.title}`}
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileTap={{ scale: 0.9 }}
        transition={SPRING.pop}
        onClick={() => onOpen(item.id)}
        style={{ width: size, height: size }}
        className="flex items-center justify-center"
      >
        <span
          className={cn(
            'flex size-[72%] rotate-45 items-center justify-center rounded-[7px] border-2 border-white shadow-pin',
            selected && 'ring-4 ring-beam',
          )}
          style={{ background: meta.color }}
        >
          <Icon size={selected ? 18 : 14} aria-hidden className="-rotate-45 text-white" />
        </span>
      </motion.button>
    </MapHtmlMarker>
  );
}

function ClusterTile({ group, onZoom }: { group: Group; onZoom: (group: Group) => void }) {
  const counts = kindsOf(group.items);
  const found = (counts.found / group.items.length) * 100;
  const size = group.items.length < 10 ? 40 : 46;
  const label = `Объявлений здесь: ${group.items.length} (нашли ${counts.found}, потеряли ${counts.lost})`;
  return (
    <MapHtmlMarker position={group} anchor={[size / 2, size / 2]} zIndex={Z_INDEX}>
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={() => onZoom(group)}
        style={{ width: size, height: size }}
        className="flex items-center justify-center transition-transform duration-150 hover:scale-110"
      >
        <span
          className="flex size-[76%] rotate-45 items-center justify-center rounded-[9px] border-2 border-white shadow-pin"
          style={{
            background: `linear-gradient(135deg, ${LOST_KIND_META.found.color} ${found}%, ${LOST_KIND_META.lost.color} ${found}%)`,
          }}
        >
          <span className="-rotate-45 text-sm font-semibold text-white tabular-nums">
            {group.items.length}
          </span>
        </span>
      </button>
    </MapHtmlMarker>
  );
}

interface LostMapLayerProps {
  items: readonly LostItemCard[];
  /** The opened post: drawn on its own even when the filters leave it out of `items`. */
  selected?: LostItemCard | null;
  onOpen: (id: number) => void;
}

/**
 * Posts of «Потеряшки» on the map while the tab is open: one diamond per post, merged into a
 * count tile where they crowd at city zoom (a tap zooms in). The selected post stands on its
 * own, with its search circle when the owner gave one.
 */
export function LostMapLayer({ items, selected = null, onOpen }: LostMapLayerProps) {
  const { map } = useMap();
  const viewport = useMapViewport();
  const { flyTo } = useMapActions();
  const selectedId = selected?.id ?? null;

  const groups = useMemo<Group[]>(() => {
    const rest = items.filter((item) => item.id !== selectedId);
    if (!map || !viewport || viewport.zoom >= UNCLUSTER_ZOOM) {
      return rest.map((item) => ({
        key: `p${item.id}`,
        lat: item.lat,
        lng: item.lng,
        items: [item],
      }));
    }
    const placed: { group: Group; x: number; y: number }[] = [];
    for (const item of rest) {
      const [x = 0, y = 0] = map.project([item.lng, item.lat]);
      const near = placed.find(
        (entry) => Math.hypot(entry.x - x, entry.y - y) <= CLUSTER_RADIUS_PX,
      );
      if (near) near.group.items.push(item);
      else
        placed.push({
          group: { key: `p${item.id}`, lat: item.lat, lng: item.lng, items: [item] },
          x,
          y,
        });
    }
    return placed.map(({ group }) => group);
  }, [items, selectedId, map, viewport]);

  const zoomInto = (group: Group) => {
    const zoom = viewport?.zoom ?? 13;
    flyTo(group, { minZoom: Math.min(zoom + 2, UNCLUSTER_ZOOM) });
  };

  return (
    <>
      {groups.map((group) => {
        const [only] = group.items;
        return group.items.length === 1 && only ? (
          <Pin key={group.key} item={only} selected={false} onOpen={onOpen} />
        ) : (
          <ClusterTile key={group.key} group={group} onZoom={zoomInto} />
        );
      })}
      {selected && (
        <>
          <Pin item={selected} selected onOpen={onOpen} />
          {selected.kind === 'lost' && selected.radius_m !== null && (
            <MapCircle
              center={selected}
              radiusM={selected.radius_m}
              color={LOST_KIND_META.lost.color.toUpperCase()}
            />
          )}
        </>
      )}
    </>
  );
}
