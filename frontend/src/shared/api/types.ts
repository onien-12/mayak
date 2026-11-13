/**
 * Mirror of docs/API.md — keep in sync 1:1 with the HTTP contract.
 * JSON is snake_case; datetimes are ISO 8601 UTC strings; line geometry is `[lng, lat][]`.
 */

// ── Enums ───────────────────────────────────────────────────────────────────────────────

export type Layer = 'infrastructure' | 'event' | 'tourism' | 'issue';
export type PlaceStatus =
  'pending' | 'unverified' | 'preliminary' | 'verified' | 'needs_review' | 'hidden' | 'archived';
export type VoteKind = 'present' | 'absent' | 'unclear';
export type UserLevel = 'newcomer' | 'resident' | 'trusted' | 'expert';
export type UserRole = 'user' | 'moderator' | 'admin';
export type EventPhase = 'open' | 'closed' | 'soon' | 'ongoing' | 'finished' | 'cancelled';
export type IssueStage = 'detected' | 'confirmed' | 'forwarded' | 'in_progress' | 'resolved';
export type IssueSeverity = 'low' | 'medium' | 'high';
export type InfoSource = 'user' | 'official';
export type RouteKind = 'walk' | 'car' | 'bike' | 'hike' | 'excursion';
export type RouteStatus = 'pending' | 'published' | 'needs_review' | 'hidden';
export type RouteVisibility = 'private' | 'public';
export type RouteDifficulty = 'easy' | 'medium' | 'hard';
/** `roads`: routed along streets and trails (OpenStreetMap); `direct`: straight segments (trails). */
export type PathMode = 'roads' | 'direct';
/** Who drew the line: OSRM on OpenStreetMap data, 2GIS Routing, or straight segments. */
export type PathSource = 'osm' | '2gis' | 'straight';
export type StopKind =
  | 'poi'
  | 'viewpoint'
  | 'landmark'
  | 'water'
  | 'food'
  | 'rest'
  | 'camp'
  | 'transport'
  | 'danger'
  | 'via';
/** `vl_ru`: afisha events; `vl_ru_off`: utility outages; `osm`: OpenStreetMap objects. */
export type ExternalSourceId = 'vl_ru' | 'vl_ru_off' | 'osm' | 'wikivoyage';
export type OutageResource = 'cold_water' | 'hot_water' | 'heat' | 'electricity';
export type AreaKind =
  | 'park'
  | 'embankment'
  | 'square'
  | 'beach'
  | 'island'
  | 'viewpoint'
  | 'campus'
  | 'quarter'
  | 'complex'
  | 'other';
/** Where a looked-up territory boundary came from. */
export type AreaGeometrySource = '2gis' | 'osm';
/** `community`: user content; `external`: imported (afisha, outages). */
export type ContentOrigin = 'community' | 'external';
export type ComplaintReason =
  'inaccurate' | 'duplicate' | 'outdated' | 'spam' | 'offensive' | 'rules' | 'fraud' | 'impassable';
export type TargetType = 'place' | 'route';
/** What a moderation case can be about: held photos, comments, reviews and notes have their own (SPEC §24.1). */
export type ModerationTarget = TargetType | 'photo' | 'comment' | 'review' | 'note';
/** A photo, comment, review or note held on its own. */
export type HeldKind = 'photo' | 'comment' | 'review' | 'note';
export type HoldState = 'screening' | 'held' | 'released' | 'decided';
/** Who held it: the keyboard-mashing heuristic, the model, or a check that did not happen for an author with low standing. */
export type HoldSource = 'heuristic' | 'ai' | 'standing';
export type ModerationTrigger =
  | 'premoderation'
  | 'complaints'
  | 'absent_votes'
  | 'auto_text'
  | 'auto_image'
  | 'auto_ai'
  | 'appeal'
  | 'clarification';
export type AiVerdict = 'ok' | 'suspicious' | 'violation';
export type AiCategory =
  | 'spam'
  | 'ads'
  | 'offensive'
  | 'personal_data'
  | 'fraud'
  | 'off_topic'
  | 'nonsense'
  | 'dangerous'
  | 'inappropriate_image'
  // Photo checks (SPEC §24.2).
  | 'nudity'
  | 'sexual'
  | 'violence'
  | 'shocking'
  | 'obscene'
  | 'advertising'
  | 'not_a_place';
/** `release` / `remove`: the two outcomes for a held photo, comment, review or note (log entries only). */
export type ModerationAction =
  'approve' | 'reject' | 'request_changes' | 'hide' | 'restore' | 'release' | 'remove';
export type NotificationKind =
  | 'event_joined'
  | 'event_changed'
  | 'event_cancelled'
  | 'comment'
  | 'respect'
  | 'moderation'
  | 'place_verified'
  | 'level_up'
  | 'issue_update'
  | 'territory';
export type HistoryKind =
  | 'created'
  | 'edited'
  | 'status_changed'
  | 'moderation'
  | 'issue_stage'
  | 'official_info'
  | 'photos_added';

export type MinStatus = 'any' | 'preliminary' | 'verified';
export type AttributeValue = string | number | boolean;
export type Attributes = Record<string, AttributeValue>;
/** `[lng, lat]` */
export type PathPoint = [number, number];

// ── Errors ──────────────────────────────────────────────────────────────────────────────

export interface ApiFieldError {
  field: string;
  message: string;
}

export interface ApiErrorBody {
  detail: string;
  code: string;
  errors?: ApiFieldError[];
}

// ── Users ───────────────────────────────────────────────────────────────────────────────

export interface UserBrief {
  id: number;
  username: string;
  display_name: string;
  level: UserLevel;
  role: UserRole;
  reputation: number;
}

export interface UserPermissions {
  can_moderate: boolean;
  publishes_directly: boolean;
  can_respect: boolean;
  daily_place_limit: number;
  places_left_today: number;
}

export interface UserMe extends UserBrief {
  email: string;
  bio: string;
  created_at: string;
  permissions: UserPermissions;
  unread_notifications: number;
  /** Private: only in the owner's own `UserMe`, never shown to anyone else. */
  home: HomeArea | null;
}

/** The user's declared home area (SPEC §16). Coordinates are stored rounded to ~100 m. */
export interface HomeArea {
  lat: number;
  lng: number;
  /** District / street for display. */
  label: string | null;
  set_at: string;
  /** `null` = can be changed now. */
  can_change_at: string | null;
}

export interface HomeInput {
  lat: number;
  lng: number;
  /** ≤ 120 */
  label?: string;
}

export interface UserStats {
  places_total: number;
  places_verified: number;
  votes: number;
  reviews: number;
  routes: number;
  events_organized: number;
  respects_received: number;
}

export interface UserProfile extends UserBrief {
  bio: string;
  created_at: string;
  stats: UserStats;
  /** `null` for expert. */
  next_level: { level: UserLevel; reputation_required: number } | null;
  respected_by_me: boolean;
}

export interface ReputationEvent {
  id: number;
  delta: number;
  reason: string;
  message: string;
  place_id: number | null;
  created_at: string;
}

export interface Subscription {
  id: number;
  title: string;
  lat: number;
  lng: number;
  radius_m: number;
  layers: Layer[];
  created_at: string;
  /** The automatic «Мой район» subscription: managed with the home area, cannot be deleted directly (409). */
  is_home: boolean;
}

export interface SubscriptionInput {
  title: string;
  lat: number;
  lng: number;
  /** 200..10000 */
  radius_m: number;
  layers: Layer[];
}

export interface Favorites {
  places: PlaceCard[];
  routes: RouteCard[];
}

// ── Auth ────────────────────────────────────────────────────────────────────────────────

export interface Captcha {
  token: string;
  question: string;
}

export interface RegisterInput {
  email: string;
  username: string;
  display_name: string;
  password: string;
  captcha_token: string;
  captcha_answer: string;
  /** Honeypot — must stay empty. */
  website?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: 'bearer';
  user: UserMe;
}

export interface UserUpdate {
  display_name?: string;
  bio?: string;
}

// ── Catalog ─────────────────────────────────────────────────────────────────────────────

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldDef {
  key: string;
  label: string;
  type: 'boolean' | 'number' | 'text' | 'select';
  options?: FieldOption[];
  unit?: string;
}

export interface Category {
  id: number;
  slug: string;
  layer: Layer;
  group: string;
  name: string;
  icon: string;
  fields: FieldDef[];
}

// ── Places ──────────────────────────────────────────────────────────────────────────────

export interface Photo {
  id: number;
  url: string;
  width: number;
  height: number;
  /** Set for a freely licensed external photo (Wikimedia Commons); `null` = uploaded by a user. */
  credit: PhotoCredit | null;
  /**
   * The viewer's own photo that did not pass the automatic check (SPEC §24.1): only they and
   * moderators see it until a moderator decides. Absent on an older backend.
   */
  on_review?: boolean;
}

/**
 * The publication did not pass the automatic check and waits for a moderator (SPEC §24.1).
 * Only for its author and moderators; reasons are plain lines such as «Текст: бессмыслица»,
 * «Фото 2: не про место», never the model's numbers.
 */
export interface ScreeningHold {
  reasons: string[];
}

/**
 * The map service a hot-linked cover is borrowed from (SPEC §20, §25): shown on the cover as
 * «Фото: Яндекс Карты» linking to the object's page there.
 */
export interface CoverSource {
  source: string;
  label: string;
  url: string;
}

/** Author and licence of an external photo — must be shown with the photo. */
export interface PhotoCredit {
  /** E.g. «Алексей Кондратюк». */
  author: string;
  /** E.g. «CC BY-SA 3.0». */
  license: string;
  source_url: string;
}

/**
 * Licence notice of a description taken from a free source (Wikivoyage, Wikipedia) — must be
 * shown with the text: «Текст: Викигид, CC BY-SA 4.0».
 */
export interface TextCredit {
  /** E.g. «Викигид», «Википедия». */
  label: string;
  license: string;
  /** The source text. */
  url: string;
}

/**
 * Aggregate rating from an external catalogue: a reference next to our own reviews, never
 * mixed into `rating_avg`.
 */
export interface ExternalRating {
  source: '2gis';
  rating: number;
  count: number;
  url: string;
}

/** Where a rating comes from: our own reviews or an external catalogue. */
export type RatingSource = 'mayak' | 'yandex' | '2gis' | 'google';

export interface CombinedRatingPart {
  source: RatingSource;
  rating: number;
  /** `null` when the source does not say how many ratings stand behind it. */
  count: number | null;
}

/**
 * Blend of our reviews and what external catalogues say (SPEC §22), from cached data only.
 * Not the residents' rating — always show it as combined, with its parts.
 */
export interface CombinedRating {
  /** 1..5, rounded to 0.1. */
  value: number;
  /** Ratings behind it: ours + the sources' counts where known. */
  count: number;
  /** Ours first when present. */
  parts: CombinedRatingPart[];
}

/** Content imported from a trusted external source (SPEC §11). */
export interface ExternalSource {
  source: ExternalSourceId;
  /** E.g. «Афиша VL.ru». */
  label: string;
  /** The original page. */
  url: string;
}

export interface EventBrief {
  starts_at: string;
  ends_at: string;
  phase: EventPhase;
  /** ₽; 0 = free; `null` = unknown (imported events) — never render `null` as «бесплатно». */
  price: number | null;
  /** Free-form, e.g. «от 1500 до 3000 ₽». */
  price_note: string | null;
  capacity: number | null;
  participants_count: number;
  is_meetup: boolean;
}

export interface EventDetail extends EventBrief {
  seats_left: number | null;
  age_limit: number | null;
  registration_url: string | null;
  /** Meetups: only for organizer and participants. */
  contact: string | null;
  is_cancelled: boolean;
  registration_closed: boolean;
  series_id: string | null;
  venue_place_id: number | null;
  is_joined: boolean;
}

/** Utility outage imported from VL.ru (SPEC §15). */
export interface OutageBrief {
  number: string;
  resource: OutageResource;
  buildings_count: number;
  complaints_count: number;
}

export interface OutageBuilding {
  address: string;
  lat: number;
  lng: number;
}

export interface IssueBrief {
  stage: IssueStage;
  severity: IssueSeverity;
  radius_m: number | null;
  source: InfoSource;
  /** `null` for ordinary issue reports. */
  outage: OutageBrief | null;
}

export interface IssueDetail extends IssueBrief {
  detected_at: string;
  resolved_at: string | null;
  official_note: string | null;
  expected_fix_at: string | null;
  appeal_number: string | null;
  responsible_org: string | null;
  /** Affected houses of an imported outage, `[]` otherwise. */
  outage_buildings: OutageBuilding[];
}

/** Used for map markers and every list. */
export interface PlaceCard {
  id: number;
  layer: Layer;
  category_id: number;
  title: string;
  lat: number;
  lng: number;
  address: string | null;
  status: PlaceStatus;
  /** 0..100 */
  trust_score: number;
  cover_url: string | null;
  tags: string[];
  /** Set when the cover is a freely licensed external photo — show it on the cover. */
  cover_credit: PhotoCredit | null;
  /** Set when the cover is borrowed from a map service's photos — show its mark on the cover. */
  cover_source?: CoverSource | null;
  rating_avg: number | null;
  rating_count: number;
  /** `null`/absent → show `rating_avg`. */
  combined_rating?: CombinedRating | null;
  author_id: number;
  created_at: string;
  last_confirmed_at: string | null;
  is_stale: boolean;
  /** `null` for user content. */
  external: ExternalSource | null;
  /** The location this place belongs to (SPEC §17); `null` for standalone places. */
  area: AreaRef | null;
  event: EventBrief | null;
  issue: IssueBrief | null;
}

// ── Areas (locations, SPEC §17) ─────────────────────────────────────────────────────────

/** `[lng, lat]` */
export type GeoPosition = [number, number];
/** A closed ring: first position = last position. */
export type GeoRing = GeoPosition[];

/** GeoJSON territory; the outer ring comes first, then holes. */
export type GeoPolygon =
  { type: 'Polygon'; coordinates: GeoRing[] } | { type: 'MultiPolygon'; coordinates: GeoRing[][] };

export interface AreaRef {
  id: number;
  title: string;
}

export interface AreaHighlight {
  category_id: number;
  count: number;
}

/** A location («Нагорный парк») that groups the concrete places inside it. */
export interface AreaCard {
  id: number;
  title: string;
  kind: AreaKind;
  /** Exact territory (simplified to ≤ 200 vertices). */
  geometry: GeoPolygon;
  /** Label point, guaranteed inside the territory. */
  lat: number;
  lng: number;
  /** Bounding radius around the label point (for fitting the camera). */
  radius_m: number;
  cover_url: string | null;
  cover_credit: PhotoCredit | null;
  /** Set when the cover is borrowed from a map service's photos — show its mark on the cover. */
  cover_source?: CoverSource | null;
  /** Public infrastructure + tourism places inside. */
  places_count: number;
  /** 0..100 — how much there is to see and do. */
  interest: number;
  rating_avg: number | null;
  /** `null`/absent → show `rating_avg`. */
  combined_rating?: CombinedRating | null;
  /** Top categories by count (≤ 5). */
  highlights: AreaHighlight[];
  events_upcoming: number;
  issues_open: number;
  /** Territory imported from OpenStreetMap → show «© участники OpenStreetMap». */
  external: ExternalSource | null;
  /** SPEC §23.4: `null` without an interest profile, absent on an older backend → show `interest`. */
  personal_interest?: PersonalInterest | null;
}

/** Interest moved towards the viewer (SPEC §23). `topics`: why — the 1–2 best matching topics. */
export interface PersonalInterest {
  /** 0..100, replaces `interest` in what the viewer sees, labelled «для вас». */
  value: number;
  topics: TopicSlug[];
}

export interface AreaDetail extends AreaCard {
  description: string;
  /** Set when the description comes from a free source. */
  description_credit: TextCredit | null;
  /** Linked 2GIS map object (the park polygon etc.). */
  object_id: string | null;
  author: UserBrief | null;
  created_at: string;
  can_edit: boolean;
  external_rating: ExternalRating | null;
  /** Freely licensed photos of the territory itself (credit always set). */
  photos: Photo[];
  /** Everything public inside, all layers; best first. */
  places: PlaceCard[];
  /** What the location is about (SPEC §23.2), strongest first, ≤ 4; absent on an older backend. */
  topics?: TopicSlug[];
}

export interface AreasQuery {
  /** `minLng,minLat,maxLng,maxLat` */
  bbox?: string;
  q?: string;
  kind?: AreaKind[];
  object_id?: string;
  /** Default 0; the zoomed-out map asks for 1 so empty imported territories do not clutter it. */
  min_places?: number;
  /** Default 200. */
  limit?: number;
  /** csv of `TopicSlug` — the interest profile of a visitor without an account (SPEC §23). */
  topics?: string;
}

export interface AreaInput {
  /** 3..80 */
  title: string;
  kind: AreaKind;
  description?: string;
  object_id?: string;
  /** Exact territory: drawn by the user or taken from a lookup candidate. */
  geometry?: GeoPolygon;
  /** Fallback when there is no geometry: a circle (radius 50..5000), stored as a polygon. */
  lat?: number;
  lng?: number;
  radius_m?: number;
}

export type AreaUpdate = Partial<AreaInput>;

/** Exactly one of `object_id` or `q` (+ optional `lat`, `lng` to bias the search). */
export interface AreaGeometryLookupQuery {
  object_id?: string;
  q?: string;
  lat?: number;
  lng?: number;
}

export interface AreaGeometryCandidate {
  title: string;
  source: AreaGeometrySource;
  geometry: GeoPolygon;
  attribution: string | null;
}

export interface MyVote {
  kind: VoteKind;
  created_at: string;
}

export interface Verification {
  present: number;
  absent: number;
  unclear: number;
  my_vote: MyVote | null;
}

export interface PlaceDetail extends Omit<PlaceCard, 'event' | 'issue'> {
  description: string;
  /** Set when the description comes from a free source. */
  description_credit: TextCredit | null;
  /** Practical advice (how to get there, best time…). */
  tips: string | null;
  attributes: Attributes;
  category: Category;
  photos: Photo[];
  author: UserBrief;
  updated_at: string;
  verification: Verification;
  my_rating: number | null;
  is_favorite: boolean;
  can_edit: boolean;
  can_appeal: boolean;
  /** Last moderator reason while pending/hidden/archived. */
  moderation_note: string | null;
  /** Set while the place is `pending` because it did not pass the automatic check; author and staff only. */
  screening_hold?: ScreeningHold | null;
  /** The 2GIS map object this place is, if linked. */
  object_id: string | null;
  /** Only for places linked to a 2GIS object (SPEC §19). */
  external_rating: ExternalRating | null;
  comments_count: number;
  event: EventDetail | null;
  issue: IssueDetail | null;
  /** What the place is about (SPEC §23.2), strongest first, ≤ 4; empty for issues, absent on an older backend. */
  topics?: TopicSlug[];
}

export interface HistoryEntry {
  id: number;
  kind: HistoryKind;
  message: string;
  actor: UserBrief | null;
  old_status: PlaceStatus | null;
  new_status: PlaceStatus | null;
  created_at: string;
}

export interface Review {
  id: number;
  author: UserBrief;
  /** 1..5 */
  rating: number;
  text: string;
  created_at: string;
  /** The viewer's own review that did not pass the automatic check: only they and moderators see it. */
  on_review?: boolean;
}

export interface Comment {
  id: number;
  author: UserBrief;
  text: string;
  created_at: string;
  can_delete: boolean;
  /** The viewer's own comment that did not pass the automatic check: only they and moderators see it. */
  on_review?: boolean;
}

export interface PlacesQuery {
  /** `minLng,minLat,maxLng,maxLat` */
  bbox?: string;
  /** `<lat>,<lng>` — places within `radius_m`, sorted by distance (spot sheet). */
  near?: string;
  /** With `near`: default 80, max 1000. */
  radius_m?: number;
  layers?: Layer[];
  categories?: number[];
  min_status?: MinStatus;
  q?: string;
  tags?: string[];
  /** `key:value` pairs, e.g. `free:true`. */
  attrs?: string[];
  event_from?: string;
  event_to?: string;
  include_past_events?: boolean;
  include_resolved?: boolean;
  author_id?: number;
  /** Places belonging to the area. */
  area_id?: number;
  /** Omitted = both. */
  origin?: ContentOrigin;
  limit?: number;
}

export interface EventRepeat {
  /** 1..30 */
  interval_days: number;
  /** 2..12 */
  count: number;
}

export interface EventInput {
  starts_at: string;
  ends_at: string;
  capacity?: number | null;
  /** ₽, 0 = free (default 0). */
  price?: number | null;
  price_note?: string | null;
  age_limit?: number | null;
  registration_url?: string | null;
  contact?: string | null;
  is_meetup?: boolean;
  venue_place_id?: number | null;
  repeat?: EventRepeat;
}

export interface IssueInput {
  severity?: IssueSeverity;
  detected_at?: string;
  /** 50..5000 */
  radius_m?: number | null;
}

export interface PlaceInput {
  layer: Layer;
  category_id: number;
  /** 3..120 */
  title: string;
  /** ≤ 5000 */
  description?: string;
  lat: number;
  lng: number;
  address?: string;
  /** Omitted → assigned automatically by position; `null` → explicitly none. */
  area_id?: number | null;
  attributes?: Attributes;
  /** ≤ 8, lowercased, ≤ 24 chars each. */
  tags?: string[];
  /** ≤ 2000 */
  tips?: string;
  /** ≤ 8, own uploads. */
  photo_ids?: number[];
  /** Required iff layer = "event". */
  event?: EventInput;
  /** Optional, only layer = "issue". */
  issue?: IssueInput;
}

export interface PlaceUpdate extends Partial<
  Omit<PlaceInput, 'layer' | 'event' | 'issue' | 'photo_ids'>
> {
  /** Full replacement list. */
  photo_ids?: number[];
  event?: Partial<Omit<EventInput, 'repeat'>> & {
    is_cancelled?: boolean;
    registration_closed?: boolean;
  };
  issue?: IssueInput;
}

export interface VoteInput {
  kind: VoteKind;
  comment?: string;
  lat?: number;
  lng?: number;
}

export interface ReviewInput {
  /** 1..5 */
  rating: number;
  /** ≤ 2000 */
  text: string;
}

export interface IssueOfficialInput {
  stage?: IssueStage;
  official_note?: string | null;
  expected_fix_at?: string | null;
  appeal_number?: string | null;
  responsible_org?: string | null;
}

export type EventsScope = 'upcoming' | 'past' | 'all';

export type EventsSort = 'start' | 'popular' | 'price' | 'distance';

export interface EventsQuery {
  scope?: EventsScope;
  from?: string;
  to?: string;
  categories?: number[];
  q?: string;
  meetups?: 'only' | 'exclude';
  origin?: ContentOrigin;
  /** `price = 0` exactly. */
  free?: boolean;
  sort?: EventsSort;
  lat?: number;
  lng?: number;
  /** Only events within this distance of `lat`, `lng` (both required). */
  radius_m?: number;
  limit?: number;
  offset?: number;
}

// ── Interests and recommendations (SPEC §23) ────────────────────────────────────────────

export type TopicSlug =
  | 'sea'
  | 'views'
  | 'history'
  | 'architecture'
  | 'nature'
  | 'art'
  | 'music'
  | 'food'
  | 'sport'
  | 'family'
  | 'learning'
  | 'fun'
  | 'unusual';

export interface Topic {
  slug: TopicSlug;
  /** «Море и берег» */
  label: string;
  /** «набережные, пляжи, бухты, маяки» */
  description: string;
}

export interface MyInterests {
  /** Chosen by the person, in catalogue order. */
  topics: TopicSlug[];
  /** Learned from behaviour and not chosen («мы заметили»), strongest first. */
  noticed: TopicSlug[];
  /** The picker was shown and answered (even with nothing chosen). */
  onboarded: boolean;
}

export interface InterestsInput {
  /** 0..13; replaces the chosen set and sets `onboarded`. */
  topics: TopicSlug[];
}

export interface InterestSignal {
  kind: 'search';
  /** 3..100 characters; matched to topics and discarded, never stored. */
  q: string;
}

export interface Recommendations {
  /** `false`: no profile (no account topics and no `topics` param) → `items` is empty. */
  personalized: boolean;
  items: Recommendation[];
}

export interface Recommendation {
  /** Events are places of layer `event`. */
  type: 'area' | 'place';
  /** 0..1, for ordering only — never shown. */
  score: number;
  /** Why: 1–2 topics, strongest first. */
  topics: TopicSlug[];
  /** Set when `type = "area"`. */
  area: AreaCard | null;
  /** Set when `type = "place"`. */
  place: PlaceCard | null;
}

export type RecommendationsScope = 'map' | 'events';

export interface RecommendationsQuery {
  /** `map` (default): areas and tourism places · `events`: upcoming events. */
  scope?: RecommendationsScope;
  /** Map scope: `minLng,minLat,maxLng,maxLat`. */
  bbox?: string;
  /** Events scope, as in `GET /events`. */
  from?: string;
  to?: string;
  /** csv of `TopicSlug` for a visitor; ignored for a signed-in caller who has a profile. */
  topics?: string;
  /** Default 12, max 30. */
  limit?: number;
}

// ── Utility outages ─────────────────────────────────────────────────────────────────────

export interface OutageSummary {
  /** Last successful import; `null` = never. */
  updated_at: string | null;
  source_url: string;
  totals: { outages: number; buildings: number };
  /** Always all four resources. */
  by_resource: { resource: OutageResource; outages: number; buildings: number }[];
}

/** One house with all its current outages — for house dots on the map. */
export interface OutageBuildingPoint {
  address: string;
  lat: number;
  lng: number;
  resources: OutageResource[];
  place_ids: number[];
}

export interface OutageBuildingsQuery {
  /** `minLng,minLat,maxLng,maxLat` — required. */
  bbox: string;
  resource?: OutageResource[];
}

export interface OutageAddressMatch {
  address: string;
  lat: number;
  lng: number;
  outages: PlaceCard[];
}

// ── Routes ──────────────────────────────────────────────────────────────────────────────

export interface RouteCard {
  id: number;
  title: string;
  description: string;
  kind: RouteKind;
  status: RouteStatus;
  visibility: RouteVisibility;
  difficulty: RouteDifficulty | null;
  tags: string[];
  distance_m: number;
  travel_min: number;
  /** Travel + stays. */
  duration_min: number;
  /** Without `via` shaping points. */
  stops_count: number;
  cover_url: string | null;
  author: UserBrief;
  rating_avg: number | null;
  rating_count: number;
  saves_count: number;
  is_saved: boolean;
  path: PathPoint[];
  created_at: string;
  updated_at: string;
}

/** A custom waypoint, optionally linked to a map place. */
export interface RouteStop {
  /** 1-based, includes `via` points. */
  position: number;
  /** `via` = invisible shaping point of the track (no card, no number). */
  kind: StopKind;
  title: string;
  lat: number;
  lng: number;
  /** What to see / description of the point. */
  note: string;
  /** How to recognise the spot / where to turn. */
  landmark: string;
  stay_min: number;
  photos: Photo[];
  /** Along the path; `null` for the first stop. */
  distance_from_prev_m: number | null;
  /** Linked map place, if the stop was added from the map. */
  place: PlaceCard | null;
}

export interface RouteDetail extends RouteCard {
  tips: string | null;
  path_mode: PathMode;
  path_source: PathSource;
  stops: RouteStop[];
  can_edit: boolean;
  my_rating: number | null;
  /** Set while the route is `pending` because it did not pass the automatic check; author and staff only. */
  screening_hold?: ScreeningHold | null;
}

export interface StopInput {
  /** Existing map place: title / lat / lng default to the place's. */
  place_id?: number;
  /** Default `poi`. */
  kind?: StopKind;
  /** Required when `place_id` is absent (optional for `via`). */
  title?: string;
  lat?: number;
  lng?: number;
  /** ≤ 2000 */
  note?: string;
  /** ≤ 500 */
  landmark?: string;
  /** 0..600 */
  stay_min?: number;
  /** ≤ 6 per stop, own uploads. */
  photo_ids?: number[];
}

export interface RouteInput {
  /** 3..120 */
  title: string;
  /** ≤ 5000 */
  description?: string;
  kind: RouteKind;
  difficulty?: RouteDifficulty | null;
  /** Default `public`. */
  visibility?: RouteVisibility;
  /** Default `roads`; `direct` for trails where roads routing is useless. */
  path_mode?: PathMode;
  /** ≤ 2000: what to take, best season, where to start. */
  tips?: string | null;
  /** ≤ 8 */
  tags?: string[];
  /** 2..40 incl. via; at least 2 non-via; order = array order. */
  stops: StopInput[];
}

export type RoutesSort = 'new' | 'popular' | 'rating';

export interface RoutesQuery {
  kind?: RouteKind[];
  difficulty?: RouteDifficulty[];
  /** Title, description, tags. */
  q?: string;
  author_id?: number;
  sort?: RoutesSort;
  limit?: number;
  offset?: number;
}

export interface RoutePreviewInput {
  kind: RouteKind;
  path_mode?: PathMode;
  /** 2..40 */
  points: { lat: number; lng: number }[];
}

export interface RoutePreview {
  path: PathPoint[];
  distance_m: number;
  travel_min: number;
  /** `legs_m[i]` = distance from point i to i+1. */
  legs_m: number[];
  source: PathSource;
}

// ── Notes ───────────────────────────────────────────────────────────────────────────────

/** A short public comment pinned to a 2GIS object or to plain coordinates (SPEC §13). */
export interface MapNote {
  id: number;
  lat: number;
  lng: number;
  text: string;
  /** 2GIS map object id the note is attached to (from the MapGL click target). */
  object_id: string | null;
  /** Its name / address at the time of writing. */
  object_name: string | null;
  author: UserBrief;
  created_at: string;
  can_delete: boolean;
  reported_by_me: boolean;
  /** The viewer's own note that did not pass the automatic check: only they and moderators see it. */
  on_review?: boolean;
}

/** Exactly one selector: `bbox`, `object_id` or `near`. */
export interface NotesQuery {
  /** `minLng,minLat,maxLng,maxLat` */
  bbox?: string;
  object_id?: string;
  /** `<lat>,<lng>` */
  near?: string;
  /** With `near`: default 40, max 300. */
  radius_m?: number;
  /** Default 300. */
  limit?: number;
}

export interface NoteInput {
  lat: number;
  lng: number;
  /** 1..500 */
  text: string;
  object_id?: string;
  object_name?: string;
}

// ── Complaints ──────────────────────────────────────────────────────────────────────────

export interface ComplaintInput {
  target_type: TargetType;
  target_id: number;
  reason: ComplaintReason;
  /** ≤ 1000 */
  comment?: string;
}

// ── Collections ─────────────────────────────────────────────────────────────────────────

export interface Collection {
  id: number;
  title: string;
  description: string;
  is_public: boolean;
  owner: UserBrief;
  items_count: number;
  cover_url: string | null;
  created_at: string;
}

export interface CollectionDetail extends Collection {
  places: PlaceCard[];
  can_edit: boolean;
}

export interface CollectionInput {
  /** 3..80 */
  title: string;
  description?: string;
  is_public?: boolean;
}

export interface CollectionsQuery {
  scope?: 'public' | 'mine';
  limit?: number;
  offset?: number;
}

// ── Notifications ───────────────────────────────────────────────────────────────────────

export interface Notification {
  id: number;
  kind: NotificationKind;
  title: string;
  body: string;
  /** Frontend path: `/?place=<id>`, `/routes/<id>`, `/users/<id>`, `/moderation/<case_id>`, `/collections/<id>`. */
  link: string | null;
  is_read: boolean;
  created_at: string;
}

// ── Moderation ──────────────────────────────────────────────────────────────────────────

export interface ModerationResolution {
  action: ModerationAction;
  reason: string;
  moderator: UserBrief;
}

export interface ModerationCase {
  id: number;
  target_type: ModerationTarget;
  target_id: number;
  target_title: string;
  layer: Layer | null;
  author: UserBrief;
  triggers: ModerationTrigger[];
  /** 0..100 */
  risk: number;
  complaints_count: number;
  state: 'open' | 'resolved';
  created_at: string;
  resolved_at: string | null;
  resolution: ModerationResolution | null;
  /** Latest LLM verdict, for the queue row (details: `ModerationCaseDetail.ai_review`). */
  ai_verdict: AiVerdict | null;
  /**
   * Held by the automatic check (SPEC §24.1): only the author and moderators see it, and the
   * author has been told it did not pass and why. The field name is historical.
   */
  quiet: boolean;
}

/** LLM pre-screening result. Advisory: only a human moderator makes final decisions. */
export interface AiReview {
  verdict: AiVerdict;
  categories: AiCategory[];
  /** 0..1 */
  confidence: number;
  /** Short Russian explanation for the moderator. */
  summary: string;
  model: string;
  created_at: string;
}

export interface ComplaintItem {
  id: number;
  reason: ComplaintReason;
  comment: string;
  author: UserBrief;
  created_at: string;
}

/** A «требует уточнения» vote with what the resident wrote (SPEC §3.1). */
export interface ClarificationItem {
  id: number;
  text: string;
  author: UserBrief;
  created_at: string;
}

export interface ModerationCaseDetail extends ModerationCase {
  place: PlaceDetail | null;
  route: RouteDetail | null;
  complaints: ComplaintItem[];
  /** What residents asked to clarify about the place, newest first. */
  clarifications?: ClarificationItem[];
  /** Human-readable results of automatic checks (Russian). */
  flags: string[];
  /** Latest LLM opinion (SPEC §14); advisory only. */
  ai_review: AiReview | null;
  appeal_text: string | null;
  /** Empty for routes. */
  history: HistoryEntry[];
  /** The screening window / hold of the target, if it ever had one. */
  hold: QuietHold | null;
  /** Every screened photo of the target with its own check, held ones first. */
  photo_reviews: PhotoReview[];
  /** Hidden usefulness of a place, 0..100 (SPEC §24.3); `null` when never rated. */
  usefulness: number | null;
  /** Hidden standing of the author, 0..100 (SPEC §24.4); below 30 every doubt holds. */
  author_standing: number;
}

export interface QuietHold {
  state: HoldState;
  source: HoldSource | null;
  reasons: string[];
  /** The status the item gets back when released; its author sees it during the screening window. */
  shown_status: PlaceStatus | RouteStatus | null;
  created_at: string;
  updated_at: string;
}

export interface PhotoReview {
  photo: Photo;
  state: HoldState;
  reasons: string[];
  ai_review: AiReview | null;
}

/** A photo, comment, review or note held on its own, waiting for a moderator. Texts are originals. */
export interface HeldItem {
  /** Hold id: the release / remove endpoints take it. */
  id: number;
  kind: HeldKind;
  target_id: number;
  case_id: number;
  author: UserBrief;
  author_standing: number;
  text: string | null;
  rating: number | null;
  object_name: string | null;
  photo: Photo | null;
  place: { id: number; title: string } | null;
  route: { id: number; title: string } | null;
  reasons: string[];
  source: HoldSource | null;
  ai_review: AiReview | null;
  created_at: string;
}

export interface HeldQuery extends PageParams {
  kind?: HeldKind;
}

export interface ModerationLogEntry {
  id: number;
  case_id: number;
  moderator: UserBrief;
  action: ModerationAction;
  reason: string;
  target_type: ModerationTarget;
  target_id: number;
  target_title: string;
  created_at: string;
}

export type ModerationQueueSort = 'risk' | 'complaints' | 'newest' | 'oldest';

export interface ModerationQueueQuery {
  state?: 'open' | 'resolved';
  target_type?: TargetType;
  layer?: Layer;
  trigger?: ModerationTrigger;
  sort?: ModerationQueueSort;
  limit?: number;
  offset?: number;
}

export interface ModerationSummary {
  open: number;
  resolved_today: number;
  by_trigger: Record<ModerationTrigger, number>;
  /** Photos, comments, reviews and notes held on their own (`GET /moderation/held`). */
  held_items: number;
}

export interface ResolveCaseInput {
  action: ModerationAction;
  /** 3..1000 */
  reason: string;
}

// ── Statistics ──────────────────────────────────────────────────────────────────────────

/**
 * Community content (places without an external source) is counted apart from imports:
 * `places`, `verified_places`, `by_layer`, `top_categories`, `status_breakdown` and
 * `activity.places` are community only.
 */
export interface Stats {
  totals: {
    places: number;
    verified_places: number;
    /** Public places from VL.ru / OpenStreetMap. */
    imported_places: number;
    /** Imported places with at least one resident `present` vote. */
    confirmed_imported: number;
    /** All upcoming events. */
    events_upcoming: number;
    events_upcoming_community: number;
    /** All open issues, imported outages included. */
    issues_open: number;
    issues_open_community: number;
    issues_resolved: number;
    routes: number;
    users: number;
    votes: number;
  };
  /** Every source, 0 included. */
  imported_by_source: { source: ExternalSourceId; label: string; count: number }[];
  by_layer: { layer: Layer; count: number }[];
  /** Top 10. */
  top_categories: { category_id: number; name: string; layer: Layer; count: number }[];
  /** Public statuses. */
  status_breakdown: { status: PlaceStatus; count: number }[];
  issues_by_stage: { stage: IssueStage; count: number }[];
  /** Last 30 days, `YYYY-MM-DD`, no gaps. */
  activity: { date: string; places: number; votes: number }[];
  /** Top 5. */
  top_contributors: UserBrief[];
}

export interface PageParams {
  limit?: number;
  offset?: number;
}
