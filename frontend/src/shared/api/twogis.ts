import type { LatLng } from '../lib/geo';

/**
 * 2GIS Catalog API: Suggest, reverse geocoding and object lookup by id. The demo key allows
 * ~1000 requests a month, so never call these directly from components — use the cached
 * hooks (`useAddressSuggest`, `useReverseGeocode`, `useMapObject`), which debounce, require
 * ≥ 3 characters for Suggest and keep results for the whole session. Every call degrades
 * silently to `[]` / `null` when the key is missing, the quota is exhausted or the network fails.
 */

const CATALOG_URL = 'https://catalog.api.2gis.com/3.0';

export const TWOGIS_KEY: string = import.meta.env.VITE_2GIS_KEY?.trim() ?? '';
export const SUGGEST_MIN_LENGTH = 3;

export interface AddressSuggestion {
  id: string;
  title: string;
  subtitle: string;
  point: LatLng;
}

interface CatalogItem {
  id?: string;
  name?: string;
  full_name?: string;
  address_name?: string;
  purpose_name?: string;
  type?: string;
  subtype?: string;
  point?: { lat: number; lon: number };
}

interface CatalogResponse {
  result?: { items?: CatalogItem[] };
}

async function fetchCatalog(path: string, params: Record<string, string>, signal?: AbortSignal) {
  if (!TWOGIS_KEY) return [];
  const search = new URLSearchParams({ ...params, key: TWOGIS_KEY });
  try {
    const response = await fetch(`${CATALOG_URL}${path}?${search.toString()}`, { signal });
    if (!response.ok) return [];
    const data = (await response.json()) as CatalogResponse;
    return data.result?.items ?? [];
  } catch {
    return [];
  }
}

export async function suggestAddresses(
  query: string,
  near: LatLng,
  signal?: AbortSignal,
): Promise<AddressSuggestion[]> {
  const items = await fetchCatalog(
    '/suggests',
    {
      q: query,
      location: `${near.lng},${near.lat}`,
      fields: 'items.point',
      locale: 'ru_RU',
    },
    signal,
  );
  return items.flatMap((item, index) =>
    item.point && item.name
      ? [
          {
            id: item.id ?? `${index}-${item.name}`,
            title: item.name,
            subtitle: item.address_name ?? item.purpose_name ?? item.full_name ?? '',
            point: { lat: item.point.lat, lng: item.point.lon },
          },
        ]
      : [],
  );
}

export interface MapObjectInfo {
  id: string;
  /** Name of the object («Океан, кинотеатр») or its address when it has no name. */
  name: string;
  address: string | null;
  point: LatLng | null;
}

/**
 * Name and address of a 2GIS map object by the id from a MapGL click (`event.target.id`).
 * Returns `null` when the object is unknown to the catalog or the API is unavailable.
 */
export async function fetchMapObject(
  id: string,
  signal?: AbortSignal,
): Promise<MapObjectInfo | null> {
  const [item] = await fetchCatalog(
    '/items/byid',
    { id, fields: 'items.point,items.address_name,items.full_name', locale: 'ru_RU' },
    signal,
  );
  if (!item) return null;
  const name = item.name ?? item.address_name ?? item.full_name;
  if (!name) return null;
  return {
    id,
    name,
    address: item.address_name ?? null,
    point: item.point ? { lat: item.point.lat, lng: item.point.lon } : null,
  };
}

/**
 * What `reverseGeocode` describes: `address` — the nearest building address (or the object's
 * name when it has none); `area` — the street / neighbourhood and the city district
 * («Светланская улица, Ленинский район»), never an organisation or a building.
 */
export type GeocodeLevel = 'address' | 'area';

/** Item types of the area level: 2GIS answers with the matching ones that contain the point. */
const AREA_TYPES = 'street,adm_div.living_area,adm_div.place,adm_div.district';

function areaName(items: readonly CatalogItem[]): string | null {
  const named = (match: (item: CatalogItem) => boolean) => items.find(match)?.name?.trim();
  const local =
    named((item) => item.subtype === 'living_area' || item.subtype === 'place') ??
    named((item) => item.type === 'street');
  const district = named((item) => item.subtype === 'district');
  const districtLabel =
    district && !/район/i.test(district) ? `${district} район` : (district ?? undefined);
  const parts = [local, districtLabel].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(', ') : null;
}

/**
 * Reverse geocoding of a point (see `GeocodeLevel`), or `null` when the geocoder is
 * unavailable or knows nothing there.
 */
export async function reverseGeocode(
  point: LatLng,
  signal?: AbortSignal,
  level: GeocodeLevel = 'address',
): Promise<string | null> {
  const items = await fetchCatalog(
    '/items/geocode',
    {
      lat: String(point.lat),
      lon: String(point.lng),
      fields: 'items.point',
      locale: 'ru_RU',
      ...(level === 'area' && { type: AREA_TYPES }),
    },
    signal,
  );
  if (level === 'area') return areaName(items);
  const best = items.find((item) => item.address_name) ?? items[0];
  return best?.address_name ?? best?.name ?? best?.full_name ?? null;
}
