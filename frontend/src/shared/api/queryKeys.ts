import type {
  AreaGeometryLookupQuery,
  AreasQuery,
  CollectionsQuery,
  EventsQuery,
  HeldQuery,
  Layer,
  ModerationQueueQuery,
  NotesQuery,
  OutageBuildingsQuery,
  PageParams,
  PlacesQuery,
  RecommendationsQuery,
  RoutePreviewInput,
  RoutesQuery,
} from './types';
import type { QuestsQuery } from './questTypes';
import type { LostQuery, LostSearchQuery } from './lostTypes';
import type { GeocodeLevel } from './twogis';

/**
 * Single registry of TanStack Query keys. Every key starts with its domain so that
 * `invalidateQueries({ queryKey: queryKeys.places.all })` refreshes the whole domain.
 */
export const queryKeys = {
  auth: {
    me: ['auth', 'me'] as const,
    captcha: ['auth', 'captcha'] as const,
  },
  categories: {
    all: ['categories'] as const,
    list: (layer?: Layer) => ['categories', layer ?? 'all'] as const,
  },
  places: {
    all: ['places'] as const,
    lists: ['places', 'list'] as const,
    list: (query: PlacesQuery) => ['places', 'list', query] as const,
    detail: (id: number) => ['places', 'detail', id] as const,
    history: (id: number) => ['places', 'detail', id, 'history'] as const,
    reviews: (id: number) => ['places', 'detail', id, 'reviews'] as const,
    comments: (id: number) => ['places', 'detail', id, 'comments'] as const,
    participants: (id: number) => ['places', 'detail', id, 'participants'] as const,
    contributions: (id: number) => ['places', 'detail', id, 'contributions'] as const,
  },
  areas: {
    all: ['areas'] as const,
    lists: ['areas', 'list'] as const,
    /** `profile`: the viewer's interest profile key — `personal_interest` depends on it. */
    list: (query: AreasQuery, profile?: string) => ['areas', 'list', query, profile] as const,
    details: ['areas', 'detail'] as const,
    detail: (id: number) => ['areas', 'detail', id] as const,
    /** The area linked to a 2GIS map object (`null` when there is none). */
    byObject: (objectId: string) => ['areas', 'object', objectId] as const,
    lookup: (query: AreaGeometryLookupQuery) => ['areas', 'lookup', query] as const,
  },
  events: {
    all: ['events'] as const,
    list: (query: EventsQuery) => ['events', 'list', query] as const,
    /** Paginated afisha feed (`useInfiniteQuery`, pages of `limit` by `offset`). */
    feed: (query: EventsQuery) => ['events', 'feed', query] as const,
  },
  routes: {
    all: ['routes'] as const,
    lists: ['routes', 'list'] as const,
    list: (query: RoutesQuery) => ['routes', 'list', query] as const,
    mine: ['routes', 'mine'] as const,
    detail: (id: number) => ['routes', 'detail', id] as const,
    reviews: (id: number) => ['routes', 'detail', id, 'reviews'] as const,
    preview: (input: RoutePreviewInput) =>
      ['routes', 'preview', input.kind, input.path_mode ?? 'roads', input.points] as const,
  },
  quests: {
    all: ['quests'] as const,
    lists: ['quests', 'list'] as const,
    list: (query: QuestsQuery) => ['quests', 'list', query] as const,
    mine: ['quests', 'mine'] as const,
    detail: (id: number) => ['quests', 'detail', id] as const,
    editor: (id: number) => ['quests', 'detail', id, 'editor'] as const,
    results: (id: number) => ['quests', 'detail', id, 'results'] as const,
    reviews: (id: number) => ['quests', 'detail', id, 'reviews'] as const,
    run: (runId: number) => ['quests', 'run', runId] as const,
  },
  collections: {
    all: ['collections'] as const,
    lists: ['collections', 'list'] as const,
    list: (query: CollectionsQuery) => ['collections', 'list', query] as const,
    detail: (id: number) => ['collections', 'detail', id] as const,
  },
  users: {
    all: ['users'] as const,
    top: (limit: number) => ['users', 'top', limit] as const,
    profile: (id: number) => ['users', 'profile', id] as const,
    places: (id: number) => ['users', 'profile', id, 'places'] as const,
    routes: (id: number) => ['users', 'profile', id, 'routes'] as const,
  },
  me: {
    all: ['me'] as const,
    reputation: ['me', 'reputation'] as const,
    favorites: ['me', 'favorites'] as const,
    events: ['me', 'events'] as const,
    subscriptions: ['me', 'subscriptions'] as const,
    interests: ['me', 'interests'] as const,
  },
  interests: {
    all: ['interests'] as const,
    topics: ['interests', 'topics'] as const,
    /** `profile`: the viewer's interest profile key, so a changed profile refetches. */
    recommendations: (query: RecommendationsQuery, profile: string) =>
      ['interests', 'recommendations', query, profile] as const,
  },
  outages: {
    all: ['outages'] as const,
    summary: ['outages', 'summary'] as const,
    buildings: (query: OutageBuildingsQuery) => ['outages', 'buildings', query] as const,
    check: (q: string) => ['outages', 'check', q] as const,
  },
  notes: {
    all: ['notes'] as const,
    list: (query: NotesQuery) => ['notes', 'list', query] as const,
  },
  lost: {
    all: ['lost'] as const,
    list: (query: LostQuery) => ['lost', 'list', query] as const,
    mine: ['lost', 'mine'] as const,
    search: (query: LostSearchQuery) => ['lost', 'search', query] as const,
    detail: (id: number) => ['lost', 'detail', id] as const,
    matches: (id: number) => ['lost', 'detail', id, 'matches'] as const,
    responses: (id: number) => ['lost', 'detail', id, 'responses'] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    list: (page: PageParams) => ['notifications', 'list', page] as const,
  },
  moderation: {
    all: ['moderation'] as const,
    queue: (query: ModerationQueueQuery) => ['moderation', 'queue', query] as const,
    summary: ['moderation', 'summary'] as const,
    case: (id: number) => ['moderation', 'case', id] as const,
    log: (page: PageParams) => ['moderation', 'log', page] as const,
    held: (query: HeldQuery) => ['moderation', 'held', query] as const,
  },
  stats: ['stats'] as const,
  geo: {
    suggest: (query: string) => ['geo', 'suggest', query] as const,
    reverse: (lat: number, lng: number, level: GeocodeLevel = 'address') =>
      ['geo', 'reverse', level, lat, lng] as const,
    object: (id: string) => ['geo', 'object', id] as const,
  },
};
