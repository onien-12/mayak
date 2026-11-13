import { Clusterer, type ClustererPointerEvent, type InputMarker } from '@2gis/mapgl-clusterer';
import { useEffect, useEffectEvent, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';

import type { Layer } from '@/shared/api';
import { fromLngLat } from '@/shared/lib/geo';
import { useCategories } from '@/shared/hooks';

import {
  CLUSTER_RADIUS_PX,
  clusterStyle,
  PLACE_Z_INDEX,
  stackStyle,
  UNCLUSTER_ZOOM,
} from './cluster';
import { PLACE_UNFOLD_ZOOM, usePlaceParam } from './hooks';
import { useMap } from './mapContext';
import { MapHtmlMarker } from './MapHtmlMarker';
import { PIN_ANCHOR } from './pin';
import { PlacePin } from './PlacePin';
import { useSceneStore } from './sceneStore';
import { groupSpots } from './spots';
import { useStackParam } from './stack';
import { useMapStore } from './store';

const SELECTED_Z_INDEX = 60;
/** Above clusters and ordinary pins, below the selected one. */
const RECOMMENDED_Z_INDEX = 55;

/** What one clusterer marker stands for: the places of a spot that have no marker of their own. */
interface MarkerData {
  placeIds: readonly number[];
  layers: readonly Layer[];
}

const markerData = (marker: InputMarker): MarkerData => marker.userData as MarkerData;

/** A marker click: the section's `onSelect` when it set one, the place card otherwise. */
function selectPlace(id: number, openPlace: (id: number) => void): void {
  const { onSelect, places: shown } = useSceneStore.getState();
  const place = onSelect ? shown.find((item) => item.id === id) : undefined;
  if (onSelect && place) onSelect(place);
  else openPlace(id);
}

/**
 * The place-marker layer: feeds the scene's anchors, grouped into spots, to the 2GIS
 * clusterer and renders a React `PlacePin` into every marker element through portals.
 * Places at one point (a venue with a dozen events) are a count bubble that opens their
 * list instead of pins hiding each other. The selected place and the recommended ones
 * («Для вас») are drawn by their own markers above everything and are not counted by any
 * bubble; whatever else is at their point hangs under the pin as «+N».
 */
export function PlaceMarkers() {
  const { map } = useMap();
  const places = useSceneStore((state) => state.places);
  const anchors = useSceneStore((state) => state.anchors);
  const recommendedIds = useSceneStore((state) => state.recommendedIds);
  const picking = useMapStore((state) => state.picking);
  const { placeId, openPlace } = usePlaceParam();
  const { openStack } = useStackParam();
  const { byId } = useCategories();
  const spots = useMemo(
    () => groupSpots(anchors, placeId, recommendedIds),
    [anchors, placeId, recommendedIds],
  );
  const clustererRef = useRef<Clusterer | null>(null);

  const onClick = useEffectEvent((event: ClustererPointerEvent) => {
    if (picking || !map) return;
    const { target } = event;
    if (target.type === 'marker') {
      const { placeIds } = markerData(target.data);
      const [first] = placeIds;
      if (first === undefined) return;
      // A picker (`onSelect`) has no list to choose from — it takes the top place of the spot.
      if (placeIds.length === 1 || useSceneStore.getState().onSelect) selectPlace(first, openPlace);
      else openStack(fromLngLat(target.data.coordinates));
      return;
    }
    const zoom = clustererRef.current?.getClusterExpansionZoom(target.id) ?? map.getZoom() + 2;
    map.setCenter(event.lngLat, { duration: 400, easing: 'easeOutCubic' });
    map.setZoom(Math.min(zoom + 0.3, 18), { duration: 400, easing: 'easeOutCubic' });
  });

  useEffect(() => {
    if (!map) return;
    const clusterer = new Clusterer(map, {
      radius: CLUSTER_RADIUS_PX,
      disableClusteringAtZoom: UNCLUSTER_ZOOM,
      clusterStyle: (_, target) => {
        const layers = target.data.flatMap((marker) => markerData(marker).layers);
        return clusterStyle(layers.length, layers);
      },
    });
    clusterer.on('click', onClick);
    clustererRef.current = clusterer;
    return () => {
      clusterer.destroy();
      clustererRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    if (!map) return;
    const { setZoomedOut } = useSceneStore.getState();
    const sync = () => setZoomedOut(map.getZoom() < PLACE_UNFOLD_ZOOM);
    sync();
    map.on('zoom', sync);
    return () => {
      map.off('zoom', sync);
    };
  }, [map]);

  useEffect(() => {
    clustererRef.current?.load(
      spots
        .filter((spot) => spot.rest.length > 0)
        .map((spot) => {
          const [only] = spot.rest;
          const layers = spot.rest.map((anchor) => anchor.layer);
          const alone = spot.rest.length === 1 && spot.lifted === null && only !== undefined;
          return {
            type: 'html',
            coordinates: spot.coordinates,
            ...(alone
              ? { html: only.element, anchor: PIN_ANCHOR }
              : stackStyle(layers.length, layers, spot.lifted !== null)),
            zIndex: PLACE_Z_INDEX,
            preventMapInteractions: false,
            userData: {
              placeIds: spot.rest.map((anchor) => anchor.id),
              layers,
            } satisfies MarkerData,
          };
        }),
    );
  }, [map, spots]);

  const selected = places.find((place) => place.id === placeId);
  /** Places with a marker of their own; the rest of the scene goes through the clusterer. */
  const liftedIds = useMemo(
    () => new Set(spots.map((spot) => spot.lifted).filter((id) => id !== null)),
    [spots],
  );
  /** Places drawn as an ordinary pin; the others at a shared point are inside a bubble. */
  const pinnedIds = useMemo(
    () =>
      new Set(
        spots
          .filter((spot) => spot.rest.length === 1 && spot.lifted === null)
          .flatMap((spot) => spot.rest.map((anchor) => anchor.id)),
      ),
    [spots],
  );
  const recommended = places.filter((place) => liftedIds.has(place.id) && place.id !== placeId);

  return (
    <>
      {anchors.map((anchor, index) => {
        const place = places[index];
        if (!place || place.id !== anchor.id || !pinnedIds.has(place.id)) return null;
        return createPortal(
          <PlacePin
            place={place}
            slug={byId.get(place.category_id)?.slug}
            selected={false}
            dimmed={picking}
          />,
          anchor.element,
          anchor.id,
        );
      })}
      {recommended.map((place) => (
        <MapHtmlMarker
          key={place.id}
          position={place}
          anchor={PIN_ANCHOR}
          zIndex={RECOMMENDED_Z_INDEX}
        >
          <div onClick={() => !picking && selectPlace(place.id, openPlace)}>
            <PlacePin
              place={place}
              slug={byId.get(place.category_id)?.slug}
              selected={false}
              recommended
              dimmed={picking}
            />
          </div>
        </MapHtmlMarker>
      ))}
      {selected && (
        <MapHtmlMarker
          key={selected.id}
          position={selected}
          anchor={PIN_ANCHOR}
          zIndex={SELECTED_Z_INDEX}
        >
          <PlacePin
            place={selected}
            slug={byId.get(selected.category_id)?.slug}
            selected
            recommended={recommendedIds.has(selected.id)}
            dimmed={picking}
          />
        </MapHtmlMarker>
      )}
    </>
  );
}
