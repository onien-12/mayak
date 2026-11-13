import type {
  Attributes,
  Category,
  EventInput,
  FieldDef,
  IssueSeverity,
  Layer,
  PlaceDetail,
  PlaceInput,
  PlaceUpdate,
} from '@/shared/api';
import { FORMAT_SLUGS, SWAP_FACTS, VENUE_FACTS } from '@/shared/lib/eventFormats';
import { fromLocalInputValue, toLocalInputValue } from '@/shared/lib/format';
import type { LatLng } from '@/shared/lib/geo';

import { isRelevantFact } from '../attributeRules';

/** Raw form state: numbers stay strings until submit, booleans may be "not specified" (`null`). */
export interface PlaceFormValues {
  title: string;
  description: string;
  address: string;
  tips: string;
  tags: string[];
  attributes: Record<string, string | boolean | null | undefined>;
  event: {
    starts_at: string;
    ends_at: string;
    is_meetup: boolean;
    capacity: string;
    price: string;
    age_limit: string;
    registration_url: string;
    contact: string;
    repeat: boolean;
    repeat_interval: string;
    repeat_count: string;
  };
  issue: {
    severity: IssueSeverity;
    radius: string;
  };
}

export interface PlaceDraft {
  layer: Layer;
  category: Category;
  point: LatLng;
  venuePlaceId?: number;
  /** `undefined` → the server assigns the area by position; `null` → explicitly none. */
  areaId?: number | null;
}

const HOUR_MS = 3_600_000;

/** Facts a format asks up front instead of under «Подробности — по желанию» (SPEC §3.4). */
const PRIMARY_FIELDS: Record<string, readonly string[]> = {
  [FORMAT_SLUGS.swap]: SWAP_FACTS,
  [FORMAT_SLUGS.venue]: VENUE_FACTS,
};

/** Answers a new place of the category starts with: a swap welcomes what people bring. */
const DEFAULT_ATTRIBUTES: Record<string, PlaceFormValues['attributes']> = {
  [FORMAT_SLUGS.swap]: { bring_own: true },
};

/** The category's fields split into those asked up front and the optional rest. */
export function splitFields(category: Category): { primary: FieldDef[]; optional: FieldDef[] } {
  const keys = PRIMARY_FIELDS[category.slug] ?? [];
  return {
    primary: category.fields.filter((field) => keys.includes(field.key)),
    optional: category.fields.filter((field) => !keys.includes(field.key)),
  };
}

/** Fresh form values for a new place of this category. */
export function withCategoryDefaults(values: PlaceFormValues, category: Category): PlaceFormValues {
  const defaults = DEFAULT_ATTRIBUTES[category.slug];
  return defaults ? { ...values, attributes: { ...defaults, ...values.attributes } } : values;
}

function defaultEvent(preset: { isMeetup?: boolean }): PlaceFormValues['event'] {
  const start = new Date(Math.ceil((Date.now() + 2 * HOUR_MS) / HOUR_MS) * HOUR_MS);
  return {
    starts_at: toLocalInputValue(start),
    ends_at: toLocalInputValue(new Date(start.getTime() + 2 * HOUR_MS)),
    // Most of what residents arrange is a small meetup; a city-scale event switches it off.
    is_meetup: preset.isMeetup ?? true,
    capacity: '',
    price: '',
    age_limit: '',
    registration_url: '',
    contact: '',
    repeat: false,
    repeat_interval: '7',
    repeat_count: '4',
  };
}

export function emptyValues(preset: { address?: string; isMeetup?: boolean }): PlaceFormValues {
  return {
    title: '',
    description: '',
    address: preset.address ?? '',
    tips: '',
    tags: [],
    attributes: {},
    event: defaultEvent(preset),
    issue: { severity: 'medium', radius: '' },
  };
}

const numberText = (value: number | null | undefined) =>
  value === null || value === undefined ? '' : String(value);

export function valuesFromPlace(place: PlaceDetail): PlaceFormValues {
  const attributes: PlaceFormValues['attributes'] = {};
  for (const [key, value] of Object.entries(place.attributes)) {
    attributes[key] = typeof value === 'number' ? String(value) : value;
  }
  const { event, issue } = place;

  return {
    title: place.title,
    description: place.description,
    address: place.address ?? '',
    tips: place.tips ?? '',
    tags: place.tags,
    attributes,
    event: event
      ? {
          ...defaultEvent({ isMeetup: event.is_meetup }),
          starts_at: toLocalInputValue(event.starts_at),
          ends_at: toLocalInputValue(event.ends_at),
          capacity: numberText(event.capacity),
          price: event.price ? String(event.price) : '',
          age_limit: numberText(event.age_limit),
          registration_url: event.registration_url ?? '',
          contact: event.contact ?? '',
        }
      : defaultEvent({}),
    issue: { severity: issue?.severity ?? 'medium', radius: numberText(issue?.radius_m) },
  };
}

function toAttributes(values: PlaceFormValues, category: Category): Attributes {
  const attributes: Attributes = {};
  for (const field of category.fields) {
    const raw = values.attributes[field.key];
    if (raw === null || raw === undefined || raw === '') continue;
    if (!isRelevantFact(field.key, values.attributes)) continue;
    if (field.type === 'number') {
      const number = Number(raw);
      if (Number.isFinite(number)) attributes[field.key] = number;
    } else {
      attributes[field.key] = raw;
    }
  }
  return attributes;
}

const intOrNull = (value: string) => (value.trim() === '' ? null : Number(value));

function toEvent(values: PlaceFormValues, draft: PlaceDraft): EventInput {
  const { event } = values;
  return {
    starts_at: fromLocalInputValue(event.starts_at),
    ends_at: fromLocalInputValue(event.ends_at),
    is_meetup: event.is_meetup,
    capacity: intOrNull(event.capacity),
    price: intOrNull(event.price) ?? 0,
    age_limit: intOrNull(event.age_limit),
    registration_url: event.registration_url.trim() || null,
    contact: event.contact.trim() || null,
    venue_place_id: draft.venuePlaceId ?? null,
  };
}

function common(values: PlaceFormValues, draft: PlaceDraft) {
  return {
    category_id: draft.category.id,
    title: values.title.trim(),
    description: values.description.trim(),
    lat: draft.point.lat,
    lng: draft.point.lng,
    address: values.address.trim(),
    attributes: toAttributes(values, draft.category),
    tags: values.tags,
    tips: values.tips.trim(),
    ...(draft.areaId !== undefined && { area_id: draft.areaId }),
  };
}

export function toPlaceInput(
  values: PlaceFormValues,
  draft: PlaceDraft,
  photoIds: number[],
): PlaceInput {
  const input: PlaceInput = { layer: draft.layer, ...common(values, draft), photo_ids: photoIds };
  if (draft.layer === 'event') {
    input.event = toEvent(values, draft);
    if (values.event.repeat) {
      input.event.repeat = {
        interval_days: Number(values.event.repeat_interval),
        count: Number(values.event.repeat_count),
      };
    }
  }
  if (draft.layer === 'issue') {
    input.issue = { severity: values.issue.severity, radius_m: intOrNull(values.issue.radius) };
  }
  return input;
}

export function toPlaceUpdate(
  values: PlaceFormValues,
  draft: PlaceDraft,
  photoIds: number[],
): PlaceUpdate {
  const update: PlaceUpdate = { ...common(values, draft), photo_ids: photoIds };
  if (draft.layer === 'event') update.event = toEvent(values, draft);
  if (draft.layer === 'issue') {
    update.issue = { severity: values.issue.severity, radius_m: intOrNull(values.issue.radius) };
  }
  return update;
}
