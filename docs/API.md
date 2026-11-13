# HTTP API contract — `/api/v1`

Backend and frontend are built in parallel against this file. **Do not deviate silently**: if
something must change, change this file in the same commit and say so in your report.

## Conventions

- JSON, `snake_case`. Datetimes: ISO 8601 UTC (`2026-11-11T09:30:00Z`).
- Coordinates: `lat`, `lng` floats (WGS-84). Line geometry: `[lng, lat][]` (2GIS order).
- Auth: `Authorization: Bearer <jwt>`. "auth" below = required; "opt" = optional (anonymous
  gets public data, personal flags are `false`/`null`); "mod" = moderator or admin.
- Errors: `{"detail": "<Russian message for the user>", "code": "<machine_code>"}` with proper
  HTTP status (400, 401, 403, 404, 409, 422, 429). Validation errors (422) additionally carry
  `"errors": [{"field": "title", "message": "…"}]` and `code: "validation_error"`.
- List endpoints return plain arrays. `limit`/`offset` where stated.
- Uploaded media is served from `/media/<file>`. `GET /api/v1/health` → `{"status":"ok"}`.

## Enums

```ts
type Layer = "infrastructure" | "event" | "tourism" | "issue";
type PlaceStatus = "pending" | "unverified" | "preliminary" | "verified" | "needs_review" | "hidden" | "archived";
type VoteKind = "present" | "absent" | "unclear";
type UserLevel = "newcomer" | "resident" | "trusted" | "expert";
type UserRole = "user" | "moderator" | "admin";
type EventPhase = "open" | "closed" | "soon" | "ongoing" | "finished" | "cancelled";
type IssueStage = "detected" | "confirmed" | "forwarded" | "in_progress" | "resolved";
type IssueSeverity = "low" | "medium" | "high";
type InfoSource = "user" | "official";
type RouteKind = "walk" | "car" | "bike" | "hike" | "excursion";
type RouteStatus = "pending" | "published" | "needs_review" | "hidden";
type RouteVisibility = "private" | "public";
type RouteDifficulty = "easy" | "medium" | "hard";
type PathMode = "roads" | "direct";                  // roads: routed along streets and paths (OpenStreetMap); direct: straight segments (trails)
type PathSource = "osm" | "2gis" | "straight";      // who drew the stored line: OSRM on OpenStreetMap data · 2GIS Routing · straight segments
type StopKind = "poi" | "viewpoint" | "landmark" | "water" | "food" | "rest" | "camp" | "transport" | "danger" | "via";
type ExternalSourceId = "vl_ru" | "vl_ru_off" | "osm" | "wikivoyage";   // afisha events · utility outages · OpenStreetMap objects · Wikivoyage («Викигид») listings
type AreaKind = "park" | "embankment" | "square" | "beach" | "island" | "viewpoint" | "campus" | "quarter" | "complex" | "other";
type OutageResource = "cold_water" | "hot_water" | "heat" | "electricity";
type ComplaintReason = "inaccurate" | "duplicate" | "outdated" | "spam" | "offensive" | "rules" | "fraud" | "impassable";
type TargetType = "place" | "route";
type ModerationTarget = TargetType | "photo" | "comment" | "review" | "note"    // what a moderation case can be about (SPEC §24.1)
  | "lost_item" | "lost_response";                                               // «Потеряшки» (SPEC §26)
type ModerationTrigger = "premoderation" | "complaints" | "absent_votes" | "auto_text" | "auto_image" | "auto_ai" | "appeal" | "clarification";
type AiVerdict = "ok" | "suspicious" | "violation";
type AiCategory = "spam" | "ads" | "offensive" | "personal_data" | "fraud" | "off_topic" | "nonsense" | "dangerous"
  | "inappropriate_image"                                                              // old combined reviews only
  | "nudity" | "sexual" | "violence" | "shocking" | "obscene" | "advertising" | "not_a_place"; // photo checks (SPEC §24.2)
type ModerationAction = "approve" | "reject" | "request_changes" | "hide" | "restore"
  | "release" | "remove";            // the two outcomes for a held photo / comment / review / note (log entries only)
type HoldState = "screening" | "held" | "released" | "decided";
type HoldSource = "heuristic" | "ai" | "standing";
type NotificationKind = "event_joined" | "event_changed" | "event_cancelled" | "comment" | "respect"
  | "moderation" | "place_verified" | "level_up" | "issue_update" | "territory"
  | "lost_found";                    // «Потеряшки» (SPEC §26): a response, its answer, a post that may be the same thing
type HistoryKind = "created" | "edited" | "status_changed" | "moderation" | "issue_stage" | "official_info" | "photos_added";
```

## Shared schemas

```ts
interface UserBrief { id: number; username: string; display_name: string; level: UserLevel; role: UserRole; reputation: number; }

interface UserMe extends UserBrief {
  email: string; bio: string; created_at: string;
  permissions: { can_moderate: boolean; publishes_directly: boolean; can_respect: boolean; daily_place_limit: number; places_left_today: number; };
  unread_notifications: number;
  home: HomeArea | null;             // private: never present in UserBrief / UserProfile, never shown to anyone else
}

// The user's declared home area (SPEC §16). Coordinates are stored rounded to ~100 m.
interface HomeArea { lat: number; lng: number; label: string | null;   // label: district / street for display, optional
  set_at: string; can_change_at: string | null; }                       // null = can be changed now

interface UserProfile extends UserBrief {
  bio: string; created_at: string;
  stats: { places_total: number; places_verified: number; votes: number; reviews: number; routes: number; events_organized: number; respects_received: number; };
  next_level: { level: UserLevel; reputation_required: number } | null;   // null for expert
  respected_by_me: boolean;
}

interface FieldDef { key: string; label: string; type: "boolean" | "number" | "text" | "select"; options?: { value: string; label: string }[]; unit?: string; }
interface Category { id: number; slug: string; layer: Layer; group: string; name: string; icon: string; fields: FieldDef[]; }

interface Photo { id: number; url: string; width: number; height: number;
  credit: PhotoCredit | null;         // null = uploaded by a user of the platform
  on_review: boolean; }               // the viewer's own photo held by the automatic check (SPEC §24.1)
// The publication did not pass the automatic check and waits for a moderator (SPEC §24.1); author and moderators only.
// Plain lines: «Текст: бессмыслица», «Фото 2: не про место», «Текст: слишком мало сведений о месте»,
// «Похоже на случайный набор букв: название», «Нужна ручная проверка модератора» — never the model's numbers.
interface ScreeningHold { reasons: string[]; }
// Freely licensed external photo (Wikimedia Commons). Must be shown with the photo.
interface PhotoCredit { author: string; license: string; source_url: string; }      // e.g. «Алексей Кондратюк», «CC BY-SA 3.0»
// Licence notice of a description taken from a free source (Wikivoyage, Wikipedia). Must be shown with the text.
interface TextCredit { label: string; license: string; url: string; }   // «Викигид» | «Википедия», «CC BY-SA 4.0», the source text
// Aggregate rating from an external catalogue, shown as a reference next to our own reviews; never mixed into rating_avg.
interface ExternalRating { source: "2gis"; rating: number; count: number; url: string; }

// Blend of our reviews and what external catalogues say (SPEC §22). Cached data only.
interface CombinedRating {
  value: number;        // 1..5, rounded to 0.1
  count: number;        // ratings behind it: ours + the sources' counts where known
  parts: { source: "mayak" | "yandex" | "2gis" | "google"; rating: number; count: number | null }[];  // ours first when present
}

// Content imported from a trusted external source (SPEC §11). null for user content.
interface ExternalSource { source: ExternalSourceId; label: string; url: string; }   // label e.g. «Афиша VL.ru», url = original page

interface EventBrief { starts_at: string; ends_at: string; phase: EventPhase;
  price: number | null;              // ₽; 0 = free; null = unknown (imported events) — never render null as «бесплатно»
  price_note: string | null;         // free-form, e.g. «от 1500 до 3000 ₽»
  capacity: number | null; participants_count: number; is_meetup: boolean; }
interface EventDetail extends EventBrief {
  seats_left: number | null; age_limit: number | null; registration_url: string | null;
  contact: string | null;            // meetups: only for organizer and participants
  is_cancelled: boolean; registration_closed: boolean; series_id: string | null;
  venue_place_id: number | null;     // e.g. the basketball court the meetup is held at
  is_joined: boolean;
}

// Utility outage imported from VL.ru (SPEC §15). null for ordinary issue reports.
interface OutageBrief { number: string; resource: OutageResource; buildings_count: number; complaints_count: number;
  started_at: string; planned_end_at: string | null; organization: string | null; }
interface OutageBuilding { address: string; lat: number; lng: number; }

interface IssueBrief { stage: IssueStage; severity: IssueSeverity; radius_m: number | null; source: InfoSource; outage: OutageBrief | null; }
interface IssueDetail extends IssueBrief {
  detected_at: string; resolved_at: string | null;
  official_note: string | null; expected_fix_at: string | null; appeal_number: string | null; responsible_org: string | null;
  outage_buildings: OutageBuilding[];                // affected houses of an imported outage, [] otherwise
}

// A cover borrowed from a map service's photos for an object without any of its own (SPEC §20, §25):
// hot-linked, never stored; null while external reviews are off. Shown as «Фото: <label>» linking to `url`.
interface CoverSource { source: "yandex" | "2gis" | "google"; label: string; url: string; }

// Used for map markers and every list.
interface PlaceCard {
  id: number; layer: Layer; category_id: number; title: string;
  lat: number; lng: number; address: string | null;
  status: PlaceStatus; trust_score: number;           // 0..100
  cover_url: string | null; tags: string[];
  cover_credit: PhotoCredit | null;                   // set when the cover is a freely licensed external photo — show it on the cover
  cover_source?: CoverSource | null;                  // set when the cover is borrowed from a map service (SPEC §25) — show its mark on it
  rating_avg: number | null; rating_count: number;
  combined_rating: CombinedRating | null;             // null: no source rating known, or external reviews off → show rating_avg
  author_id: number; created_at: string; last_confirmed_at: string | null; is_stale: boolean;
  external: ExternalSource | null;
  area: { id: number; title: string } | null;         // the location this place belongs to (SPEC §17)
  event: EventBrief | null; issue: IssueBrief | null;
}

// A location ("Нагорный парк") that groups the concrete places inside it. The map shows areas first.
// GeoJSON geometry, positions are [lng, lat]; rings are closed (first = last), outer ring first.
type GeoPolygon = { type: "Polygon"; coordinates: [number, number][][] }
                | { type: "MultiPolygon"; coordinates: [number, number][][][] };

interface AreaCard {
  id: number; title: string; kind: AreaKind;
  geometry: GeoPolygon;                               // exact territory (simplified to ≤ 200 vertices)
  lat: number; lng: number;                           // label point, guaranteed inside the territory
  radius_m: number;                                   // bounding radius around the label point (for fitting the camera)
  cover_url: string | null;
  cover_credit: PhotoCredit | null;                   // as in PlaceCard
  cover_source?: CoverSource | null;                  // as in PlaceCard
  places_count: number;                               // public infrastructure + tourism places inside
  interest: number;                                   // 0..100, how much there is to see/do (SPEC §17)
  rating_avg: number | null;                          // mean rating of the places inside
  combined_rating: CombinedRating | null;             // as in PlaceCard; ours = rating_avg with the ratings inside
  highlights: { category_id: number; count: number }[];   // what is here: top categories by count (≤ 5)
  events_upcoming: number; issues_open: number;
  community_events_upcoming: number;                  // of events_upcoming, those residents made (no external source, not a system author)
  next_community_event: CommunityEventRef | null;     // the nearest of them by start → «Скоро здесь: …», opens the event (SPEC §17)
  bare_background: boolean;                           // imported, ≤ 3 places, nothing by residents inside → not drawn on «Карта» by default (SPEC §18)
  external: ExternalSource | null;                    // territory imported from OpenStreetMap → show «© участники OpenStreetMap»
  personal_interest: PersonalInterest | null;         // SPEC §23.4; null without an interest profile → show `interest`
}
// A public, not finished, not cancelled event residents made inside the area; computed on read.
interface CommunityEventRef { id: number; title: string; starts_at: string; }
// Interest moved towards the viewer (SPEC §23). `topics`: why — the 1–2 best matching topics, may be empty.
interface PersonalInterest { value: number; topics: TopicSlug[]; }
interface AreaDetail extends AreaCard {
  description: string; object_id: string | null;      // linked 2GIS map object (the park polygon etc.)
  description_credit: TextCredit | null;              // set when the description comes from a free source (SPEC §19, §21)
  author: UserBrief | null; created_at: string; can_edit: boolean;
  external_rating: ExternalRating | null;
  photos: Photo[];                                    // freely licensed photos of the territory itself (credit always set)
  places: PlaceCard[];                                // everything public inside, all layers; best first
  topics: TopicSlug[];                                // what the location is about (SPEC §23.2), strongest first, ≤ 4
}

interface PlaceDetail extends Omit<PlaceCard, "event" | "issue"> {
  description: string; tips: string | null;           // tips: practical advice (how to get there, best time…)
  description_credit: TextCredit | null;              // set when the description comes from a free source (SPEC §19, §21)
  attributes: Record<string, string | number | boolean>;
  category: Category; photos: Photo[]; author: UserBrief; updated_at: string;
  verification: { present: number; absent: number; unclear: number;      // vote counts
                  my_vote: { kind: VoteKind; created_at: string } | null };
  my_rating: number | null;
  is_favorite: boolean; can_edit: boolean; can_appeal: boolean;
  moderation_note: string | null;                     // last moderator reason while pending/hidden/archived
  screening_hold: ScreeningHold | null;               // set while pending because of the automatic check (author, moderators)
  object_id: string | null;                           // the 2GIS map object this place is, if linked
  external_rating: ExternalRating | null;             // only for places linked to a 2GIS object (SPEC §19)
  comments_count: number;
  event: EventDetail | null; issue: IssueDetail | null;
  topics: TopicSlug[];                                // what the place is about (SPEC §23.2), strongest first, ≤ 4; empty for issues
}

interface HistoryEntry { id: number; kind: HistoryKind; message: string; actor: UserBrief | null;
  old_status: PlaceStatus | null; new_status: PlaceStatus | null; created_at: string; }

interface Review { id: number; author: UserBrief; rating: number; text: string; created_at: string;   // rating 1..5
  on_review: boolean; }              // the viewer's own review held by the automatic check (SPEC §24.1)
interface Comment { id: number; author: UserBrief; text: string; created_at: string; can_delete: boolean;
  on_review: boolean; }              // the viewer's own comment held by the automatic check

interface RouteCard {
  id: number; title: string; description: string; kind: RouteKind;
  status: RouteStatus; visibility: RouteVisibility; difficulty: RouteDifficulty | null; tags: string[];
  distance_m: number; travel_min: number; duration_min: number;   // duration = travel + stays
  stops_count: number;                                // without "via" shaping points
  cover_url: string | null; author: UserBrief;
  rating_avg: number | null; rating_count: number; saves_count: number; is_saved: boolean;
  path: [number, number][];                           // [lng, lat]
  created_at: string; updated_at: string;
}
interface RouteStop {
  position: number;                                   // 1-based, includes "via" points
  kind: StopKind;                                     // "via" = invisible shaping point of the track (no card, no number)
  title: string; lat: number; lng: number;
  note: string;                                       // what to see / description of the point
  landmark: string;                                   // how to recognise the spot / where to turn («за красной будкой налево»)
  stay_min: number; photos: Photo[];
  distance_from_prev_m: number | null;                // along the path; null for the first stop
  place: PlaceCard | null;                            // linked map place, if the stop was added from the map
}
interface RouteDetail extends RouteCard { tips: string | null; path_mode: PathMode; path_source: PathSource; stops: RouteStop[]; can_edit: boolean; my_rating: number | null;
  screening_hold: ScreeningHold | null; }   // set while pending because of the automatic check (author, moderators)

interface Collection { id: number; title: string; description: string; is_public: boolean; owner: UserBrief;
  items_count: number; cover_url: string | null; created_at: string; }
interface CollectionDetail extends Collection { places: PlaceCard[]; can_edit: boolean; }

interface Notification { id: number; kind: NotificationKind; title: string; body: string;
  link: string | null;               // frontend path, see "Frontend links"
  is_read: boolean; created_at: string; }

interface Subscription { id: number; title: string; lat: number; lng: number; radius_m: number; layers: Layer[]; created_at: string;
  is_home: boolean; }                // the automatic «Мой район» subscription: managed with the home area, cannot be deleted directly (409)

interface ReputationEvent { id: number; delta: number; reason: string; message: string; place_id: number | null; created_at: string; }
```

### Frontend links (used in `Notification.link`)

`/?place=<id>` · `/routes/<id>` · `/users/<id>` · `/moderation/<case_id>` · `/collections/<id>` · `/lost/<id>` · `/quests/<id>`

## Auth

| Method | Path | Auth | Body → Response |
|---|---|---|---|
| GET  | `/auth/captcha`  | –    | → `{ token: string; question: string }` (e.g. «Сколько будет 7 + 5?») |
| POST | `/auth/register` | –    | `{ email, username, display_name, password, captcha_token, captcha_answer: string, website?: string }` → `{ access_token, token_type: "bearer", user: UserMe }` (201). `username`: 3–24 chars `[a-z0-9_]`; password ≥ 8; `website` is a honeypot and must be empty. 409 on taken e-mail/username. |
| POST | `/auth/login`    | –    | `{ email, password }` → `{ access_token, token_type, user: UserMe }` |
| GET  | `/auth/me`       | auth | → `UserMe` |

## Users

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET   | `/users/top?limit=10`          | –    | → `UserBrief[]` by reputation |
| GET   | `/users/{id}`                  | opt  | → `UserProfile` |
| PATCH | `/users/me`                    | auth | `{ display_name?, bio? }` → `UserMe` |
| PUT   | `/users/me/home`               | auth | `{ lat, lng, label?: string (≤ 120) }` → `UserMe`. 429 with `code: "home_cooldown"` while `can_change_at` is in the future. Also creates/moves the automatic «Мой район» territory subscription. |
| DELETE| `/users/me/home`               | auth | → `UserMe` (removing is always allowed; setting again is still subject to the cooldown) |
| GET   | `/users/{id}/places?limit=50`  | opt  | → `PlaceCard[]` (public statuses; own profile also `pending`/`hidden`) |
| GET   | `/users/{id}/routes`           | opt  | → `RouteCard[]` |
| POST  | `/users/{id}/respect`          | auth | → `UserProfile` (409 if already sent, 403 for newcomers, 429 daily limit) |
| GET   | `/me/reputation?limit=50`      | auth | → `ReputationEvent[]` newest first |
| GET   | `/me/favorites`                | auth | → `{ places: PlaceCard[]; routes: RouteCard[] }` |
| GET   | `/me/events`                   | auth | → `PlaceCard[]` joined or organized, not finished, by start |
| GET   | `/me/subscriptions`            | auth | → `Subscription[]` |
| POST  | `/me/subscriptions`            | auth | `{ title, lat, lng, radius_m (200..10000), layers: Layer[] }` → `Subscription` (201), max 10 |
| DELETE| `/me/subscriptions/{id}`       | auth | 204 |

## Catalog

| GET | `/categories?layer=` | – | → `Category[]` ordered by layer, group, id |

## Places

### `GET /places` (opt) → `PlaceCard[]`

| Param | Meaning |
|---|---|
| `bbox` | `minLng,minLat,maxLng,maxLat`; optional |
| `layers` | csv of `Layer`; default all |
| `categories` | csv of category ids |
| `min_status` | `any` (default: unverified, preliminary, verified, needs_review) · `preliminary` (preliminary + verified) · `verified` |
| `q` | case-insensitive search in title, description, address, tags |
| `tags` | csv; place must have all |
| `attrs` | csv of `key:value` (e.g. `free:true,accessible:true`); equality on `attributes` |
| `event_from`, `event_to` | ISO datetimes; events overlapping the interval |
| `include_past_events` | default `false` (finished/cancelled events hidden) |
| `include_resolved` | default `false` (resolved issues hidden) |
| `author_id` | filter by author |
| `area_id` | places belonging to the area |
| `origin` | `community` (user content) · `external` (imported: afisha, outages) · omitted = both |
| `limit` | default 500, max 1000. When more places match, the most trusted come first (`trust_score` desc), so zooming in reveals the rest |

`hidden`/`archived` are never returned here. `pending` is returned only to its author
(so they see their own submissions on the map).

### Areas (locations)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET    | `/areas`      | opt  | → `AreaCard[]`; `personal_interest` for the caller's profile or the `topics` param (csv of `TopicSlug`, for visitors without an account); params `bbox`, `q`, `kind` (csv), `object_id`, `min_places` (default 0; the map asks for 1 when zoomed out so empty imported territories do not clutter it), `limit` (default 200); sorted by `interest` desc |
| GET    | `/areas/{id}` | opt  | → `AreaDetail`; `topics` param as in `GET /areas` |
| POST   | `/areas`      | auth | `AreaInput` → `AreaDetail` (201). Level `trusted`+ or moderator (403 otherwise). 409 when it would duplicate an existing area (same `object_id`, or the territories overlap by more than half of the smaller one). Existing places inside are attached automatically. |
| GET    | `/areas/geometry-lookup` | auth | → `AreaGeometryCandidate[]` (≤ 5). Exactly one of `object_id` (2GIS map object → its polygon via 2GIS Places) or `q` (+ optional `lat`,`lng` to bias; boundary search in OpenStreetMap). Level `trusted`+ or moderator. Empty array when nothing polygonal is found. Cached; rate-limited (429). |
| PATCH  | `/areas/{id}` | auth | author or mod; same fields, all optional → `AreaDetail` (re-attaches places when geometry changes) |
| DELETE | `/areas/{id}` | mod  | 204; places are detached, not deleted |

```ts
interface AreaInput {
  title: string;                         // 3..80
  kind: AreaKind; description?: string; object_id?: string;
  geometry?: GeoPolygon;                 // exact territory: drawn by the user or taken from a lookup candidate
  lat?: number; lng?: number; radius_m?: number;   // fallback when no geometry: a circle (radius 50..5000), stored as a polygon
}
// Validation of geometry: closed rings, 4..500 vertices in total, no self-intersections, area ≤ 30 km².
interface AreaGeometryCandidate { title: string; source: "2gis" | "osm"; geometry: GeoPolygon; attribution: string | null; }
```

### Other place endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST   | `/places`                 | auth | `PlaceInput` → `PlaceDetail` (201). Status per SPEC §2/§6. 429 on limits. |
| GET    | `/places/{id}`            | opt  | → `PlaceDetail`. 404 for `pending`/`hidden` unless author/mod. |
| PATCH  | `/places/{id}`            | auth | author or mod; `PlaceUpdate` → `PlaceDetail`; writes history; event time change/cancel notifies participants |
| DELETE | `/places/{id}`            | auth | author or mod; soft → `archived`; 204 |
| GET    | `/places/{id}/history`    | opt  | → `HistoryEntry[]` newest first |
| POST   | `/places/{id}/votes`      | auth | `{ kind: VoteKind; comment?: string; lat?: number; lng?: number }` → `PlaceDetail`. 403 on own place. `unclear` needs a `comment` of 5+ characters (422 on `comment` otherwise): it opens or joins a moderation case with the trigger `clarification`; the place keeps its status. The comment is shown to moderators only. |
| DELETE | `/places/{id}/votes`      | auth | Takes the caller's vote back → `PlaceDetail` (`my_vote: null`, counts, trust and status recomputed without it). No vote — the place is returned unchanged. Casting again later is not rewarded a second time. |
| GET    | `/places/{id}/reviews`    | opt  | → `Review[]` newest first |
| POST   | `/places/{id}/reviews`    | auth | `{ rating: 1..5; text: string (≤ 2000) }` → `Review` (upsert). Only `infrastructure`/`tourism` (400 otherwise). |
| GET    | `/places/{id}/comments`   | opt  | → `Comment[]` oldest first |
| POST   | `/places/{id}/comments`   | auth | `{ text (1..2000) }` → `Comment` (201) |
| DELETE | `/comments/{id}`          | auth | author or mod; 204 |
| POST   | `/places/{id}/photos`     | auth | `{ photo_ids: number[] }` → `PlaceDetail` (anyone can add photos; max 12 per place) |
| PUT    | `/places/{id}/favorite`   | auth | 204 |
| DELETE | `/places/{id}/favorite`   | auth | 204 |
| POST   | `/places/{id}/appeal`     | auth | `{ text (10..2000) }` → `{ case_id }` (201). Author only, when `can_appeal`. |

```ts
interface PlaceInput {
  layer: Layer; category_id: number;                  // category must belong to layer
  title: string;                                      // 3..120
  description?: string;                               // ≤ 5000
  lat: number; lng: number; address?: string;
  object_id?: string | null;                          // 2GIS map object the place is (from the tapped object); enables ExternalRating
  area_id?: number | null;                            // omitted → assigned automatically by position; null → explicitly none
  attributes?: Record<string, string | number | boolean>;   // unknown keys dropped, types coerced/validated by category fields
  tags?: string[];                                    // ≤ 8, lowercased, ≤ 24 chars each
  tips?: string;                                      // ≤ 2000
  photo_ids?: number[];                               // ≤ 8, own uploads
  event?: EventInput;                                 // required iff layer = "event"
  issue?: IssueInput;                                 // optional, only layer = "issue"
}
interface EventInput {
  starts_at: string; ends_at: string;                 // ends_at > starts_at, ends_at in the future
  capacity?: number | null; price?: number | null;    // price in ₽, 0 = free (default 0)
  price_note?: string | null;
  age_limit?: number | null; registration_url?: string | null; contact?: string | null;
  is_meetup?: boolean; venue_place_id?: number | null;
  repeat?: { interval_days: number; count: number };  // 1..30 days, 2..12 occurrences → series
}
interface IssueInput { severity?: IssueSeverity; detected_at?: string; radius_m?: number | null; }   // radius 50..5000

// All fields optional.
interface PlaceUpdate extends Partial<Omit<PlaceInput, "layer" | "event" | "issue" | "photo_ids">> {
  photo_ids?: number[];                               // full replacement list
  event?: Partial<Omit<EventInput, "repeat">> & { is_cancelled?: boolean; registration_closed?: boolean };
  issue?: IssueInput;
}
```

### Events

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET    | `/events`                          | opt  | → `PlaceCard[]`, see params below |
| PUT    | `/places/{id}/event/participation` | auth | body optional `{ note?: string (1..300) }`; join → `PlaceDetail`; 409 when closed/full/finished/cancelled (a request for help words it its own way: «Помощников уже достаточно — спасибо!»). `note` — swap only (SPEC §3.4): posted as the comment «Принесу: …» (screened, shares the comments' 30/hour limit); a participant may send it again to add more, the same words are not repeated; 422 on `note` for other categories or when the organiser asked not to bring anything |
| DELETE | `/places/{id}/event/participation` | auth | leave → `PlaceDetail` |
| GET    | `/places/{id}/event/participants`  | –    | → `UserBrief[]` |
| GET    | `/places/{id}/event/contributions` | opt  | → `EventContribution[]` — what the current participants of a swap bring: their «Принесу: …» comments without the prefix, oldest first; the viewer's own held one with `on_review` |

```ts
interface EventContribution { comment_id: number; author: UserBrief; text: string; on_review: boolean; }
```

Category rules of the resident formats (SPEC §3.4): `help` and `swap` are always `is_meetup = true`
(contact only for those who responded / signed up) and free (`price = 0`); `price`/`is_meetup` sent
otherwise are corrected silently on create and edit.

`GET /events` params: `scope` = `upcoming` (default: not finished, not cancelled) · `past` ·
`all`; `from`, `to` (ISO, overlap); `categories` (csv ids); `q`; `meetups` = `only` · `exclude`
· omitted; `origin` = `community` (user-created) · `external` (imported) · omitted;
`free=true` (price = 0 exactly); `sort` = `start` (default) · `popular` (participants) · `price` ·
`distance` (requires `lat`,`lng`); `radius_m` (100–100000, requires `lat`,`lng`): only events
within that distance, in the chosen sort order; `limit` (default 100), `offset`.

### Issues

The «Проблемы» section (SPEC §3.3) uses existing endpoints only: residents' problems are
`GET /places?layers=issue&origin=community&include_resolved=true&bbox=…` (optionally
`categories`; stage filtering and the «open and fresh first» order are applied by the client),
outages are `GET /places?layers=issue&origin=external` plus the `/outages/*` endpoints below.

| PATCH | `/places/{id}/issue/official` | mod | `{ stage?: IssueStage; official_note?: string \| null; expected_fix_at?: string \| null; appeal_number?: string \| null; responsible_org?: string \| null }` → `PlaceDetail`. Sets `source = "official"` when any official field is non-null; writes history; notifies author and voters. |

### Utility outages (imported, SPEC §15)

Outages are ordinary `issue` places (`category.slug = "utilities"`, `external.source = "vl_ru_off"`,
`issue.outage` set) and therefore appear in `GET /places`; these endpoints add the
address-level view.

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/outages/summary` | – | → `OutageSummary` |
| GET | `/outages/buildings` | – | → `OutageBuildingPoint[]`; params `bbox` (required), `resource` (csv). One entry per house with **all** its current outages — for drawing house dots on the map. Max 2000. |
| GET | `/outages/check?q=` | – | → `OutageAddressMatch[]` (≤ 10). Free-text address («тухачевского 24»): every query token must occur in the normalised address. Empty array = no current outage known for the address. |

```ts
interface OutageSummary {
  updated_at: string | null;                 // last successful import; null = never
  source_url: string;                        // https://www.vl.ru/off/
  totals: { outages: number; buildings: number };
  by_resource: { resource: OutageResource; outages: number; buildings: number }[];   // always all 4 resources
}
interface OutageBuildingPoint { address: string; lat: number; lng: number; resources: OutageResource[]; place_ids: number[]; }
interface OutageAddressMatch { address: string; lat: number; lng: number; outages: PlaceCard[]; }
```

## Uploads

| POST | `/uploads` | auth | `multipart/form-data`, field `file` → `Photo` (201). JPEG/PNG/WebP ≤ 8 MB. 415 / 413 on violations. |

## Routes

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET    | `/routes`               | opt  | → `RouteCard[]`; params `kind` (csv), `difficulty` (csv), `q` (title, description, tags), `author_id`, `sort` = `new` (default) · `popular` (saves) · `rating`, `limit`, `offset`. Only **public** routes with status `published`/`needs_review`. |
| GET    | `/me/routes`            | auth | → `RouteCard[]` all own routes (private, public, pending, hidden), newest first |
| POST   | `/routes/preview`       | auth | `{ kind: RouteKind; path_mode?: PathMode; points: {lat,lng}[] (2..40) }` → `{ path: [number,number][]; distance_m: number; travel_min: number; legs_m: number[]; source: PathSource }` (`legs_m[i]` = distance from point i to i+1) |
| POST   | `/routes`               | auth | `RouteInput` → `RouteDetail` (201). Any registered user. |
| GET    | `/routes/{id}`          | opt  | → `RouteDetail`. Private / pending / hidden → 404 unless owner or mod. |
| GET    | `/routes/{id}/gpx`      | opt  | → `application/gpx+xml` attachment (`<wpt>` per non-via stop with name/desc, one `<trk>` with the path). Same visibility as above. |
| PATCH  | `/routes/{id}`          | auth | author or mod; `Partial<RouteInput>` → `RouteDetail` |
| DELETE | `/routes/{id}`          | auth | author or mod; 204 |
| PUT    | `/routes/{id}/save`     | auth | 204 |
| DELETE | `/routes/{id}/save`     | auth | 204 |
| GET    | `/routes/{id}/reviews`  | opt  | → `Review[]` |
| POST   | `/routes/{id}/reviews`  | auth | `{ rating, text }` → `Review` (upsert; not on own route) |

```ts
interface RouteInput {
  title: string;                // 3..120
  description?: string;         // ≤ 5000
  kind: RouteKind;
  difficulty?: RouteDifficulty | null;
  visibility?: RouteVisibility;                       // default "public"
  path_mode?: PathMode;                               // default "roads"; "direct" for trails where roads routing is useless
  tips?: string | null;                               // ≤ 2000: what to take, best season, where to start
  tags?: string[];                                    // ≤ 8
  stops: StopInput[];                                 // 2..40 incl. via; at least 2 non-via; order = array order
}
interface StopInput {
  place_id?: number;                                  // existing map place: title/lat/lng default to the place's
  kind?: StopKind;                                    // default "poi"
  title?: string; lat?: number; lng?: number;         // required when place_id is absent (title optional for "via")
  note?: string;                                      // ≤ 2000
  landmark?: string;                                  // ≤ 500
  stay_min?: number;                                  // 0..600
  photo_ids?: number[];                               // ≤ 6 per stop, own uploads
}
```

Stops are **custom waypoints** (own title, coordinates, photos, landmark) optionally linked to a
map place — a trekking route does not need its waypoints to exist as public places.

Path: `path_mode = "roads"` → a routing provider through all stops in order (`walk`/`hike`/
`excursion` → foot, `car` → driving, `bike` → bicycle). By default the line is built on
OpenStreetMap data by the OSRM service of FOSSGIS (`routing.openstreetmap.de`, the router behind
openstreetmap.org); the 2GIS Routing API is an optional second provider (`ROUTING_PROVIDERS`).
`"direct"` or no provider answering → straight segments (haversine, speed by kind). `via` stops
are ordinary waypoints for the router and only shape the track. `cover_url` = first photo among
stops (or linked place cover).

Visibility: `private` routes are visible only to the owner (never moderated, no reputation).
`public` routes follow SPEC §2: newcomers → `pending` (pre-moderation), others → `published`.
Saving (`/routes/{id}/save`), reviews and complaints apply to public routes only.

## Quests (SPEC §27)

A quest is a `Route` underneath (its id is the quest id); every route endpoint answers 404 for it and
no route list contains it. Players never receive the name, point, code, answers, hint (unless taken)
or story of a stage not yet passed.

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET    | `/quests`                    | opt  | → `QuestCard[]`; params `q` (title, description), `author_id`, `sort` = `new` (default) · `popular` (players who finished) · `rating`, `limit` (≤ 200), `offset`. Public quests (and the viewer's own in a screening window). |
| GET    | `/me/quests`                 | auth | → `QuestCard[]` all own quests (drafts, public, pending, hidden), newest first |
| POST   | `/quests`                    | auth | `QuestInput` → `QuestEditor` (201). Published like a route (SPEC §2, §24); `visibility` defaults to `"private"` (a draft). |
| GET    | `/quests/{id}`               | opt  | → `QuestDetail`. A draft / pending / hidden quest → 404 unless author or mod. |
| GET    | `/quests/{id}/edit`          | auth | → `QuestEditor`, author or mod (403 for others who can see the quest) |
| PATCH  | `/quests/{id}`               | auth | author or mod; `Partial<QuestInput>` (`stages` replaces all stages) → `QuestEditor` |
| DELETE | `/quests/{id}`               | auth | author or mod; 204 (runs, results and reviews go with it) |
| GET    | `/quests/{id}/results`       | opt  | → `QuestResult[]`, top 10 |
| GET    | `/quests/{id}/reviews`       | opt  | → `Review[]` |
| POST   | `/quests/{id}/reviews`       | auth | `{ rating, text }` → `Review` (upsert). 409 until the caller finished the quest (test runs aside); 403 for the author. Screened like any review. |
| POST   | `/quests/{id}/runs`          | auth | `{ team?: boolean; team_name?: string (2..40, required for a team); test?: boolean }` → `QuestRun` (201). `test` — the author's (or a moderator's) run of any own quest, drafts included, solo only; a non-test run needs a public quest and is refused to its author (403). 409 while the caller has an unfinished run of the quest (a new test run replaces an old test run). |
| POST   | `/quest-runs/join`           | auth | `{ code }` (case and spaces ignored) → `QuestRun`. 404 unknown or ended code; 403 for the quest's author; 409 when the caller plays the quest elsewhere or the team has 8 members. Joining again is idempotent. |
| GET    | `/quest-runs/{id}`           | auth | → `QuestRun`; members only (404 otherwise). Team clients poll it every 4 s. |
| POST   | `/quest-runs/{id}/check`     | auth | `QuestCheckInput` → `QuestCheckResult`. One try at the current stage. |
| POST   | `/quest-runs/{id}/hint`      | auth | `{ stage }` → `QuestRun`; the stage's hint becomes visible to the run and adds 5 minutes to its result (once per stage). 400 when the stage has no hint. |
| POST   | `/quest-runs/{id}/lead`      | auth | `{ user_id }` → `QuestRun`; the captain hands the current riddle to a member (403 for others). |
| POST   | `/quest-runs/{id}/leave`     | auth | 204; the captaincy and the riddle pass to the next member; the last one leaving ends the run. |
| POST   | `/quest-runs/{id}/abandon`   | auth | 204; the captain (or a solo player) stops the run; it never reaches the board. |

```ts
type QuestCondition = "arrival" | "code" | "answer";
type QuestZone = "riddle" | "circle";
interface QuestStart { title: string; lat: number; lng: number; }        // the only public point of a quest
interface QuestCard {
  id: number; title: string; description: string; status: RouteStatus; visibility: RouteVisibility;
  cover_url: string | null; stages_count: number; duration_min: number;
  rating_avg: number | null; rating_count: number;
  finished_count: number;                                              // distinct players of finished non-test runs
  start: QuestStart; author: UserBrief; created_at: string; updated_at: string;
}
interface QuestRunBrief { id: number; is_team: boolean; team_name: string | null; is_test: boolean; stage_number: number; stages_total: number; }
interface QuestResult { rank: number; name: string;                    // team name or the player's display name
  is_team: boolean; members_count: number;
  result_s: number;                                                    // start → last stage, plus 300 s per hint
  hints: number; finished_at: string; is_mine: boolean; }
interface QuestDetail extends QuestCard {
  can_edit: boolean;
  my_run: QuestRunBrief | null;                                        // the caller's unfinished run
  my_result: QuestResult | null;                                       // the caller's best ranked run
  has_finished: boolean;                                               // finished at least once (test runs aside): may rate
  my_rating: number | null;
  screening_hold: ScreeningHold | null;                                // author and moderators, while held (SPEC §24.1)
}
interface QuestStage {                                                 // author and moderators only
  id: number; position: number; title: string; lat: number; lng: number; place_id: number | null;
  riddle: string; photo: Photo | null; condition: QuestCondition;
  check_arrival: boolean;                                              // true for arrival; optional for code / answer
  radius_m: number; question: string; answers: string[];               // a code stage has its code as the one answer
  hint: string; reward: string; zone: QuestZone; zone_radius_m: number | null;
  zone_center: { lat: number; lng: number } | null;                    // what players see: moved off the point
}
interface QuestEditor extends QuestDetail { cover_photo: Photo | null; stages: QuestStage[]; }
interface QuestStageInput {
  id?: number | null;           // an existing stage of the quest (PATCH): it keeps its identity, so runs
                                // in progress keep their place; stages left out are removed
  title: string;                // 2..120 — the place, shown to a player once the stage is passed
  lat: number; lng: number; place_id?: number | null;
  riddle: string;               // 5..2000
  photo_id?: number | null;     // own upload
  condition?: QuestCondition;   // default "arrival"
  check_arrival?: boolean;      // code / answer: the player must also be on site
  radius_m?: number;            // 20..200, default 40
  question?: string;            // ≤ 500, required for "answer"
  answers?: string[];           // ≤ 10 × ≤ 100; exactly one (the code) for "code", at least one for "answer"
  hint?: string;                // ≤ 1000
  reward?: string;              // ≤ 3000 — the story of the place
  zone?: QuestZone;             // default "riddle"
  zone_radius_m?: number | null;  // 150..500, default 250 for "circle"
}
interface QuestInput {
  title: string; description?: string;          // 3..120; ≤ 5000
  start_title: string;                          // 3..120
  start_lat: number; start_lng: number;
  duration_min: number;                         // 10..600
  cover_photo_id?: number | null;               // own upload
  visibility?: RouteVisibility;                 // default "private"
  stages: QuestStageInput[];                    // 2..20, in playing order
}
interface QuestRunMember { user: UserBrief; is_captain: boolean; is_lead: boolean; }
interface QuestPassedStage { position: number; title: string; lat: number; lng: number; reward: string;
  passed_at: string | null; passed_by: UserBrief | null; hint_used: boolean; }
interface QuestCurrentStage {                   // never the place, code, answers or story
  position: number; condition: QuestCondition;
  check_arrival: boolean;                       // the server checks the position
  riddle: string | null;                        // null for a team member who does not hold this riddle
  photo: Photo | null;                          // same rule as the riddle
  riddle_holder: UserBrief | null;              // team runs: the stage lead
  question: string | null; has_hint: boolean;
  hint: string | null;                          // once taken
  zone: { lat: number; lng: number; radius_m: number } | null;
  tries_left: number; locked_until: string | null;
}
interface QuestRun {
  id: number; quest_id: number; quest_title: string; start: QuestStart;
  is_team: boolean; team_name: string | null; join_code: string | null;   // the code while the team run is open
  is_test: boolean; captain_id: number; members: QuestRunMember[];
  stages_total: number; stage_number: number;   // 1-based; stages_total + 1 once finished
  finished: boolean; abandoned: boolean; started_at: string; finished_at: string | null;
  hints_taken: number; penalty_min: number; result_s: number | null;
  passed: QuestPassedStage[]; current: QuestCurrentStage | null;
  can_confirm_on_site: boolean;                 // a test run
  ranked: boolean;                              // finished and on the board
}
interface QuestCheckInput { stage: number;     // position being answered; an older one answers «already passed»
  lat?: number; lng?: number; accuracy?: number;  // needed when the stage checks the position
  answer?: string;                              // the code or the answer (≤ 100)
  on_site?: boolean; }                          // test runs only: arrival confirmed by a button
interface QuestCheckResult { passed: boolean; message: string; run: QuestRun; }
```

`check`: missing input (no position for a stage that checks it, an empty code) is 400 and not a try.
Not on site → `passed: false`, «Вы ещё не на месте…» without any distance, and the code is not looked
at. A wrong code / answer → `passed: false` with the tries left. After 5 wrong tries the run pauses
for a minute (`current.locked_until`; a try meanwhile is 429). An already passed stage answers
`passed: true`, «Этот этап уже пройден — открыт следующий.» and is not counted. 409 for a finished
or abandoned run and for a stage not open yet. Passing the last stage finishes the run; it is
`ranked` unless it is a test or one of its players had finished the quest before.

## External reviews (experimental, feature-flagged — SPEC §20)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/places/{id}/external-reviews` | – | → `ExternalReviews`; `cached_only=true` → only what is already cached, the source is never asked |
| GET | `/areas/{id}/external-reviews`  | – | → `ExternalReviews`; `cached_only` as above |
| GET | `/places/{id}/external-reviews/more?source=2gis` | – | «Показать ещё» → `ExternalReviewSource` (see below) |
| GET | `/areas/{id}/external-reviews/more?source=2gis`  | – | same for an area |

```ts
interface ExternalReviews {
  enabled: boolean;                      // false → feature is off; `sources` is empty and the UI shows nothing
  sources: ExternalReviewSource[];
  pending?: boolean;                    // true → fetch is still running; poll this endpoint, reusing that task
  pending_sources?: ("yandex" | "2gis" | "google")[];   // the providers still being asked (present exactly when pending)
  links?: { source: "yandex" | "2gis" | "google"; label: string; url: string }[];
}
interface ExternalReviewSource {
  source: "yandex" | "2gis" | "google"; label: string;
  url: string;                           // the organisation's page at the source
  rating: number | null; ratings_count: number | null; reviews_count: number | null;
  reviews: { rating: number | null; text: string; published_at: string | null }[];   // ≤ 30 per lookup (≤ 200 after «more»), text truncated to 600 chars, no author data
  photos: string[];                      // ≤ 8 hot-linked image URLs, never stored — the card may show them as a
                                         // gallery fallback when it has no photos of its own, credited «Фото: <label>»
  fetched_at: string;
  reviews_available?: boolean;           // omitted/true for parsed reviews, false for rating-only 2GIS
  has_more?: boolean;        // the source holds more review texts than we have stored and this provider can page
}
// new endpoint, same auth/eligibility/404 rules as the existing one:
// GET /places/{id}/external-reviews/more?source=2gis   and   GET /areas/{id}/external-reviews/more?source=2gis
// → ExternalReviewSourceOut   (the whole source entry again, with the newly loaded reviews appended; has_more updated)
// 409 when the source has nothing more / cannot page / the target has no cached match for it; never triggers a first lookup.
```

`…/more` (the `ExternalReviewSource` above is `ExternalReviewSourceOut` on the server): one request
to the source under the same spacing and daily cap, stored with the match (later full answers and
`cached_only` include the appended reviews). `409` with `code: "no_more_reviews"` as stated (also
while the feature is off or the source is not configured); `429` with `code: "daily_cap"` when the
source's daily cap leaves no room; `502` with `code: "source_unavailable"` when the source refused
the page or its answer could not be read — the stored entry is unchanged, try again later. Only
2GIS map objects page today (`has_more` is never true for Yandex, Google or 2GIS organisations).

Yandex, 2GIS and Google are fetched independently on the first full request for a place/area (≤ 8 s, else `pending=true`), cached
7 days. `cached_only=true` (the card's summary row, the photo fallback) answers from the cache only
— lists never call these endpoints. Never mixed into `rating_avg`, `trust_score` or `interest`;
`combined_rating` on cards (SPEC §22) is a separate blended figure read from this cache, and so is
a card's `cover_source` cover (SPEC §25). `photos` holds what the source's page gave with the lookup:
Yandex, 2GIS and Google up to 30 each (SPEC §20): main photos first, then the photos attached to
reviews; a source with photos but no rating or reviews is still listed.
2GIS uses its anonymous web HTTP API and returns up to 30 recent reviews. Its cache and request
budget are independent of Yandex. The existing fresh aggregate-rating cache for linked
`object_id`s remains a fallback (`reviews_available=false`) only with current matching evidence
for that exact target and object; no extra Places API requests.
Google uses anonymous HTTP search and the `qv9Egd` review RPC. The observed preview contains
5 reviews, not a complete history; its unverified exact publication dates remain `null`.
All sources have independent caches and limits. Ambiguous identity yields no
source entry (including ratings/photos); navigation links can remain. Search matching requires
a distinctive name — exact, or ours extended by a fuller wording or a rubric — close enough
(50 m for a place, inside the territory for an area) and no similar nearby competitor, or an
explicit 2GIS ID with a geographic sanity check; where these rules abstain, an LLM picks the entry
that is the same object, or none (SPEC §20). Old cache entries without current match evidence are hidden.
Renaming/moving/rebinding a target invalidates its cached matches and no-match results.
Optional fields with their default values are omitted.

## Interests and recommendations (SPEC §23)

```ts
type TopicSlug = "sea" | "views" | "history" | "architecture" | "nature" | "art" | "music"
               | "food" | "sport" | "family" | "learning" | "fun" | "unusual";
interface Topic { slug: TopicSlug; label: string; description: string; }   // «Море и берег», «набережные, пляжи, бухты, маяки»
interface MyInterests {
  topics: TopicSlug[];        // chosen by the person, in catalogue order
  noticed: TopicSlug[];       // learned from behaviour and not chosen («мы заметили»), strongest first
  onboarded: boolean;         // the picker was shown and answered (even with nothing chosen)
}
interface Recommendations {
  personalized: boolean;      // false: no profile (no account topics and no `topics` param) → `items` is empty
  items: Recommendation[];
}
interface Recommendation {
  type: "area" | "place";     // events are places of layer "event"
  score: number;              // 0..1, for ordering only — not shown
  topics: TopicSlug[];        // why: 1–2 topics, strongest first
  area: AreaCard | null;      // set when type = "area"
  place: PlaceCard | null;    // set when type = "place"
  reason_event: CommunityEventRef | null;   // the residents' upcoming event the area (inside it) or the place (its venue) is recommended for
}
```

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET    | `/interests/topics` | –    | → `Topic[]`, the fixed catalogue in display order |
| GET    | `/me/interests` | auth | → `MyInterests` |
| PUT    | `/me/interests` | auth | `{ topics: TopicSlug[] }` (0..13, unknown slug → 422) → `MyInterests`; replaces the chosen set, sets `onboarded` |
| DELETE | `/me/interests/noticed` | auth | → `MyInterests`; forgets everything learned from behaviour |
| POST   | `/me/interests/signals` | auth | `{ kind: "search"; q: string (3..100) }` → 204. The query is matched to topics and discarded, never stored. Other signals (favourites, reviews, event participation) are recorded by their own endpoints. |
| GET    | `/recommendations` | opt | → `Recommendations`. `scope` = `map` (default: areas and tourism places) · `events` (upcoming events); `bbox` (map scope, optional); `from`, `to` (events scope, as in `GET /events`); `topics` (csv of `TopicSlug`: the profile of a visitor without an account; ignored for a signed-in caller who has a profile); `limit` (default 12, max 30). Residents' objects lead, every second item is a discovery, a location with nothing residents made inside needs a much stronger match (SPEC §23.5) |

`PlaceDetail` additionally carries `topics: TopicSlug[]` (what the place is about, strongest
first, ≤ 4; always empty for issues).

## Notes — comments pinned to any spot or 2GIS object

Lightweight public notes a user can leave by tapping **anywhere** on the map (a building, a
shop, a bench, a trailhead) without creating a full place (SPEC §13).

```ts
interface MapNote {
  id: number; lat: number; lng: number; text: string;
  object_id: string | null;          // 2GIS map object id the note is attached to (from the MapGL click target)
  object_name: string | null;        // its name/address at the time of writing
  author: UserBrief; created_at: string; can_delete: boolean; reported_by_me: boolean;
  on_review: boolean;                // the viewer's own note held by the automatic check (SPEC §24.1)
}
```

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET    | `/notes`             | opt  | → `MapNote[]` newest first. Exactly one selector: `bbox` · `object_id` · `near=<lat>,<lng>` (+ `radius_m`, default 40, max 300). `limit` default 300. Hidden notes are never returned. |
| POST   | `/notes`             | auth | `{ lat, lng, text (1..500), object_id?: string, object_name?: string }` → `MapNote` (201). Content checks reject with 422; limits: 5/day newcomer, 30/day others. |
| DELETE | `/notes/{id}`        | auth | author or mod; 204 |
| POST   | `/notes/{id}/report` | auth | 204; one per user; 3 distinct reports hide the note automatically (mods can restore by nothing — hidden notes are simply gone from lists); not on own note |

`GET /places` additionally accepts `near=<lat>,<lng>` + `radius_m` (default 80, max 1000):
places within the radius, sorted by distance — used by the "spot" sheet to show what is
already known around the tapped point.

## Lost and found — «Потеряшки» (SPEC §26)

Posts about found and lost things with a point on the map, matching between them, a search that
needs no account, and responses that exchange contacts privately. **No schema below except
`LostResponse` has a contact field**, and `LostResponse` is served only to the post's author and the
responder, filled per viewer.

```ts
type LostKind = "lost" | "found";
type LostCategory = "documents" | "keys" | "phone" | "wallet" | "bag" | "clothes" | "jewelry" | "pet" | "other";
type LostState = "active" | "returned" | "expired";       // computed: returned = closed by the author; expired = 30 days after creation
type LostResponseState = "pending" | "accepted" | "declined";
type LostRadius = 300 | 1000 | 3000;                      // how sure the owner is about the place; null = «не знаю где»

interface LostItemCard {
  id: number; kind: LostKind; category: LostCategory; title: string; description: string;
  lat: number; lng: number;
  radius_m: LostRadius | null;       // lost posts only
  happened_on: string;               // "YYYY-MM-DD", the day it was lost or found
  state: LostState; created_at: string; expires_at: string;
  author: UserBrief; cover_url: string | null; photos_count: number;
  on_review: boolean;                // the viewer's own post held by the automatic check (SPEC §24.1)
}
interface LostItem extends LostItemCard {
  photos: Photo[];
  control_question: string | null;   // found posts: what a claimant answers in the response
  is_mine: boolean;
  can_respond: boolean;              // signed in, not the author, active, not responded yet
  can_delete: boolean; can_moderate: boolean;
  is_hidden: boolean;                // moderators only: hidden by reports or by a moderator
  reported_by_me: boolean;
  pending_responses: number;         // the author only
  my_response: LostResponse | null;  // the viewer's own response
}
interface LostResponse {
  id: number; item_id: number; author: UserBrief; message: string; state: LostResponseState;
  created_at: string; decided_at: string | null; on_review: boolean;
  contact: string | null;            // the responder's: to them always, to the post's author once accepted
  owner_contact: string | null;      // the post author's: to them always, to the responder once accepted
}
interface LostMatch { item: LostItemCard; reason: string; }   // in order; why in plain words, never a score
```

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET    | `/lost`                        | opt  | → `LostItemCard[]` active posts, newest first; `kind`, `category` (csv), `since` (`YYYY-MM-DD`: lost / found on this day or later), `bbox`, `limit` (default 200, max 500). The viewer's own screened or held posts are included. |
| GET    | `/lost/mine`                   | auth | → `LostItemCard[]` the caller's posts, returned and expired included |
| GET    | `/lost/search`                 | opt  | → `LostMatch[]` (≤ 30) over active **found** posts: `q` (≤ 200), `category`, `near=<lat>,<lng>` + `radius_m` (300 · 1000 · 3000; default 1000 with `near`; 422 without `near`), `lost_on` (`YYYY-MM-DD`). Without a category the words name one when they can («кошелёк» → `wallet`), otherwise the words must meet. Stores nothing. |
| POST   | `/lost`                        | auth | `{ kind, category, title (3..120), description? (≤ 1000), lat, lng, radius_m?: LostRadius \| null (lost only), happened_on, control_question? (3..200, found only), photo_ids?: number[] (≤ 3, own free uploads) }` → `LostItem` (201). Others see it once the screening passes. 422 on flagged text, a date in the future or older than 90 days, a photo already on another post; 429 after 5 posts a day. |
| GET    | `/lost/{id}`                   | opt  | → `LostItem`; 404 for a hidden post (except moderators, and the author while it is screened or held) |
| GET    | `/lost/{id}/matches`           | opt  | → `LostMatch[]` (≤ 10). A lost post: «Похожие находки», for anyone who sees it. A found post: «Возможно, это ищут», its author and moderators only (403 otherwise). Empty for a post that is not active. |
| POST   | `/lost/{id}/close`             | auth | author; «Вернули хозяину» → `LostItem` (`state: "returned"`) |
| DELETE | `/lost/{id}`                   | auth | author or mod; 204; its responses, reports and matches go with it |
| POST   | `/lost/{id}/report`            | auth | 204; one per user, not on one's own post (400); 3 distinct reports hide the post |
| POST   | `/lost/{id}/hide` · `/unhide`  | mod  | → `LostItem`; 409 while the post is still in its screening hold (decided in `/moderation/held`) |
| GET    | `/lost/{id}/responses`         | auth | the post's author → every response that passed screening, newest first; a responder → `[their own]`; anyone else 403 |
| POST   | `/lost/{id}/responses`         | auth | `{ message (1..1000), contact (3..200) }` → `LostResponse` (201). 400 on one's own post, 409 when already responded or the post is not active, 429 after 10 a day. The post's author is notified once the response passes screening. |
| POST   | `/lost/responses/{id}/accept`  | auth | the post's author; `{ contact (3..200) }` → `LostResponse` with both contacts; the responder is notified. 409 if already decided. |
| POST   | `/lost/responses/{id}/decline` | auth | the post's author → `LostResponse`; the responder is notified |

## Complaints

| POST | `/complaints` | auth | `{ target_type: TargetType; target_id: number; reason: ComplaintReason; comment?: string (≤ 1000) }` → `{ id }` (201). 409 if the user already has an open complaint on the target; 400 on own content; `impassable` only for routes. |

A quest (SPEC §27) is complained about as `target_type: "route"` with the quest id.

## Collections

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET    | `/collections?scope=public\|mine&limit&offset` | opt | → `Collection[]` (`mine` requires auth) |
| POST   | `/collections`                       | auth | `{ title (3..80), description?, is_public?: boolean }` → `Collection` (201) |
| GET    | `/collections/{id}`                  | opt  | → `CollectionDetail` (404 if private and not owner) |
| PATCH  | `/collections/{id}`                  | auth | owner; → `Collection` |
| DELETE | `/collections/{id}`                  | auth | owner; 204 |
| PUT    | `/collections/{id}/places/{place_id}`| auth | owner; 204 |
| DELETE | `/collections/{id}/places/{place_id}`| auth | owner; 204 |

## Notifications

| GET  | `/notifications?limit=30&offset=0` | auth | → `Notification[]` newest first |
| POST | `/notifications/read`              | auth | `{ ids?: number[] }` (omitted = all) → `{ unread: number }` |

`UserMe.unread_notifications` carries the counter (poll `/auth/me`).

## Moderation

```ts
interface ModerationCase {
  id: number; target_type: ModerationTarget; target_id: number; target_title: string; layer: Layer | null;
  author: UserBrief; triggers: ModerationTrigger[]; risk: number;          // 0..100
  complaints_count: number; state: "open" | "resolved"; created_at: string; resolved_at: string | null;
  ai_verdict: AiVerdict | null;           // latest LLM verdict, for the queue row; details in ModerationCaseDetail.ai_review
  quiet: boolean;                         // held by the automatic check (SPEC §24.1); the author was told why. Historical name
  resolution: { action: ModerationAction; reason: string; moderator: UserBrief } | null;
}
// LLM pre-screening result. Advisory: only a human moderator makes final decisions.
interface AiReview { verdict: AiVerdict; categories: AiCategory[]; confidence: number;   // 0..1
  summary: string;                       // short Russian explanation for the moderator
  model: string; created_at: string; }
interface ComplaintItem { id: number; reason: ComplaintReason; comment: string; author: UserBrief; created_at: string; }
interface ClarificationItem { id: number; text: string; author: UserBrief; created_at: string; }   // original text, unmasked
interface ModerationCaseDetail extends ModerationCase {
  place: PlaceDetail | null; route: RouteDetail | null;   // as moderators see them: real status, every photo, original texts
  quest: QuestEditor | null;              // set when the route is a quest (SPEC §27): every stage with its secrets
  complaints: ComplaintItem[];
  clarifications: ClarificationItem[];   // «требует уточнения» votes on the place with what was written, newest first; [] for other targets
  flags: string[];                       // human-readable results of automatic checks and of the screening (Russian)
  ai_review: AiReview | null;            // latest LLM opinion about the text (SPEC §14); advisory only
  appeal_text: string | null;
  history: HistoryEntry[];               // empty for routes
  hold: QuietHold | null;                // the screening window / hold of the target, if it ever had one
  photo_reviews: PhotoReview[];          // every screened photo of the target with its own check, held ones first
  usefulness: number | null;             // hidden usefulness of a place, 0..100 (SPEC §24.3); null when never rated
  author_standing: number;               // hidden standing of the author, 0..100 (SPEC §24.4)
}
interface QuietHold { state: HoldState; source: HoldSource | null; reasons: string[];
  shown_status: PlaceStatus | RouteStatus | null;   // the status it gets back when released; the author sees it during the window
  created_at: string; updated_at: string; }
interface PhotoReview { photo: Photo; state: HoldState; reasons: string[]; ai_review: AiReview | null; }
// A photo, comment, review or note held on its own (SPEC §24.1). Texts are the originals.
interface HeldItem {
  id: number;                            // hold id, used by the release / remove endpoints
  kind: "photo" | "comment" | "review" | "note" | "lost_item" | "lost_response"; target_id: number; case_id: number;
  author: UserBrief; author_standing: number;
  text: string | null; rating: number | null; object_name: string | null; photo: Photo | null;
  place: { id: number; title: string } | null; route: { id: number; title: string } | null;   // what it is attached to
  reasons: string[]; source: HoldSource | null; ai_review: AiReview | null; created_at: string;
}
interface ModerationLogEntry { id: number; case_id: number; moderator: UserBrief; action: ModerationAction; reason: string;
  target_type: ModerationTarget; target_id: number; target_title: string; created_at: string; }
```

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET  | `/moderation/queue`               | mod | → `ModerationCase[]` of places and routes; params `state` (`open` default · `resolved`), `target_type`, `layer`, `trigger`, `sort` = `risk` (default) · `complaints` · `newest` · `oldest`, `limit`, `offset` |
| GET  | `/moderation/summary`             | mod | → `{ open: number; resolved_today: number; by_trigger: Record<ModerationTrigger, number>; held_items: number }` (`open`, `by_trigger`: the queue; `held_items`: `GET /moderation/held`) |
| GET  | `/moderation/cases/{id}`          | mod | → `ModerationCaseDetail` |
| POST | `/moderation/cases/{id}/resolve`  | mod | `{ action: ModerationAction; reason: string (3..1000) }` → `ModerationCaseDetail`. 409 if already resolved, and for cases of held photos / comments / reviews / notes (they are decided below). `release` / `remove` are not accepted here. |
| GET  | `/moderation/held`                | mod | → `HeldItem[]` oldest first: photos, comments, reviews, notes and lost-and-found posts and responses held on their own; params `kind` (`photo` · `comment` · `review` · `note` · `lost_item` · `lost_response`), `limit` (default 50, max 200), `offset`. A `lost_item` carries its title and description in `text`; a `lost_response` its message in `text` and the post's title in `object_name` |
| POST | `/moderation/held/{id}/release`   | mod | `{ reason: string (3..1000) }` → 204. The item appears as if it had passed; the author gets a `moderation` notification («Ваш комментарий проверен и опубликован»…) with the reason. 404 unknown, 409 already decided. |
| POST | `/moderation/held/{id}/remove`    | mod | `{ reason }` → 204. Stays hidden for good (a photo comes off its place); the author gets a `moderation` notification with the reason. |
| GET  | `/moderation/log?limit=50&offset` | mod | → `ModerationLogEntry[]` newest first (`release` / `remove` included) |

## Statistics

`GET /stats` (–) →

```ts
// Community content (places without an external source) is counted apart from imports:
// places / verified_places / by_layer / top_categories / status_breakdown / activity.places are community only.
interface Stats {
  totals: { places: number; verified_places: number;
            imported_places: number;                 // public places from VL.ru / OpenStreetMap / Wikivoyage
            confirmed_imported: number;              // imported places with at least one resident `present` vote
            events_upcoming: number; events_upcoming_community: number;   // all / community only
            issues_open: number; issues_open_community: number; issues_resolved: number;
            routes: number; users: number; votes: number; };
  imported_by_source: { source: ExternalSourceId; label: string; count: number }[];   // every source, 0 included
  by_layer: { layer: Layer; count: number }[];
  top_categories: { category_id: number; name: string; layer: Layer; count: number }[];     // top 10
  status_breakdown: { status: PlaceStatus; count: number }[];                               // public statuses
  issues_by_stage: { stage: IssueStage; count: number }[];                                  // all issues
  activity: { date: string; places: number; votes: number }[];                              // last 30 days, YYYY-MM-DD, no gaps
  top_contributors: UserBrief[];                                                            // top 5
}
```

## Implementation notes (clarifications added by the backend)

Behaviour the tables above leave open, as implemented:

- **Error codes** besides the generic `bad_request` / `unauthorized` / `forbidden` / `not_found` /
  `conflict` / `validation_error`: `captcha_failed`, `registration_rejected` (honeypot),
  `invalid_credentials`, `content_flagged` (422 for reviews / comments / notes that trip the text
  checks; profanity is not one of them, SPEC §24.5), `rate_limited` (429), `payload_too_large` (413), `unsupported_media_type` (415).
  Semantic checks done by services (wrong category for the layer, event in the past, unknown stop
  place, malformed `bbox` / `near` / csv params) use the same 422 `validation_error` envelope.
- **"Per day" limits** are rolling 24-hour windows. A recurring event series counts as one
  publication for the daily and the "3 places within 150 m" limits. `places_left_today` follows
  the same rule.
- **Votes**: `409` when the place is not public (`pending` / `hidden` / `archived` and visible to
  the voter) or when the issue is already resolved; `429` after 60 votes per hour. Comments:
  `429` after 30 per hour.
- **`GET /places`**: `near` may be combined with every other filter; with `near`, `tags` or
  `attrs` the `limit` is applied after filtering. `origin=external` covers afisha events and
  outages.
- **`GET /events`**: `sort=price` puts unknown prices (`null`) last. `scope=past` means already ended (cancelled or not);
  a cancelled event that has not ended yet is in neither `upcoming` nor `past` (only `all`).
  **`GET /me/events`** also returns own `pending` events; cancelled ones are left out.
- **Reviews** may be left on one's own place (not on one's own route: `403`).
- **Routes**: `RouteStop.distance_from_prev_m` of a visible stop is measured from the previous
  *visible* stop (the legs across `via` points are summed); for a `via` point it is the distance
  from the previous point. `distance_m` is the sum of the legs. `source` in the preview (and
  `path_source` of a saved route) names the provider that routed the whole line — `"osm"` or `"2gis"` — and is
  `"straight"` when none could. Providers are tried in the configured order, the first that routes
  every chunk wins (OSRM takes ≤ 25 points a request, 2GIS ≤ 10; longer routes are requested in
  chunks sharing their joint points and stitched). A stop farther than 300 m from the road and
  path network is not moved onto it: the line runs to the nearest reachable spot and on to the
  stop as a straight connector (out and back for an intermediate stop), and the connector counts
  in the leg distances and, at hiking pace, in `travel_min`. Requests to the public OSRM server
  are spaced at least a second apart; answers are cached in memory. `PUT /routes/{id}/save`, route reviews and complaints
  answer `409` for a route that is private or not published (when the caller can see it at all).
  `DELETE /routes/{id}` is a hard delete. Switching a route from private to public applies the
  publication rules at that moment; switching back to private closes its open moderation case.
- **Notes**: a repeated report by the same user is an idempotent `204`; reporting one's own note
  is `400`; a hidden or deleted note is `404`.
- **Moderation**: `restore` answers `409` unless the target is `hidden` / `archived`;
  `request_changes` moves the target to `pending`; any edit of a `pending` place by its author
  re-opens a pre-moderation case. After `approve` / `restore`, absent votes cast before the
  decision no longer trigger rules 1–2 of SPEC §3.2 (they still lower the trust score). A case
  closed because the author deleted the content is `resolved` with `resolution: null`.
  Appeals: a place hidden automatically by absent votes has no decision yet, so its author may
  add one appeal to the open case.
- **`GET /outages/check`**: query tokens are normalised like addresses (lower case, «ё» → «е»,
  words such as «ул», «д», «дом» dropped); words match address tokens by prefix, house numbers
  exactly («тухач 24» matches «Тухачевского ул. 24», not «…ул. 240»).
- **Areas**: the duplicate rule (overlap > half of the smaller territory → `409`) does not apply
  when the smaller territory is less than a quarter of the larger one — that is a nested location
  (a square inside a district), which SPEC §17 membership relies on. `GET /areas?bbox=` returns
  areas whose bounding box intersects the bbox. `lat`/`lng` is the centroid when it lies inside
  the territory, otherwise a representative interior point. In `PATCH /areas/{id}` a new territory
  is given as `geometry` or as the full circle triple. `places_count`, `interest`, `rating_avg`
  and `highlights` cover public infrastructure and tourism places; `AreaDetail.places` leaves out
  finished / cancelled events and resolved issues. A place whose author set `area_id` explicitly
  (a value or `null`) is not re-attached automatically later. `GET /areas/geometry-lookup` is
  limited to 30 requests per user per hour; text content of areas goes through the same checks
  as notes (`422 content_flagged`).
- **Home area**: `PUT /users/me/home` with the same point (after rounding) only updates the
  label and is not subject to the cooldown. The cooldown starts at every change of the point,
  including the first one, and survives `DELETE`.
- **`GET /routes/{id}/gpx`**: `Content-Disposition: attachment; filename="mayak-route-<id>.gpx"`
  (the header is exposed to CORS clients).
- **OpenStreetMap layer** (SPEC §18): imported places are ordinary places with `external.source = "osm"`,
  author «OpenStreetMap» (system account) and status `preliminary`; `origin=external` includes them.
  Imported territories are areas with `external.source = "osm"` and the system author. A re-import
  adds new territories but never changes existing areas; it updates untouched OSM places, keeps
  moderator-edited ones, never brings back hidden / archived ones, and archives places deleted
  from OSM unless a moderator edited them or a resident confirmed them (history: «Объект удалён из
  OpenStreetMap»). New category `playground` («Детская площадка», group «Спорт и отдых»);
  `sports_ground` gained the select field `sport` (multi / volleyball / tennis / hockey / athletics / other).
- **`GET /places` truncation**: rows are ordered by `trust_score` desc, then by the hidden
  usefulness (SPEC §24.3; places never rated count as 50), then newest first, before `limit`
  applies (with `near` the result is still nearest first).
- **Photos**: `Photo.credit` is set for Wikimedia Commons photos (hot-linked thumbnails, attached by the
  Wikimedia job only where a place or area has no photos at all). User photos
  always come first in `PlaceDetail.photos`; external photos do not count towards the 12-photo limit
  and are kept when the place's `photo_ids` list includes them (an editor may drop one by leaving it out).
  `AreaCard.cover_url` is the best cover among the places inside, else the area's own first photo.
  An existing database receives a newly committed Wikimedia snapshot once, at the next start-up.
  With nothing of that kind, a place or area may carry a cover borrowed from a map service's photos
  (`cover_source` set, `cover_credit` null; SPEC §25) — read from the external reviews' cache, never
  from the location a place lies in.
- **`external_rating`** is fetched from 2GIS only by `GET /places/{id}` / `GET /areas/{id}` (never by
  lists or writes), at most once a week per object and `TWOGIS_RATING_DAILY_LIMIT` (30) times per rolling
  day overall; a failed request keeps the last known rating and is retried after a day; an object without
  ratings gives `null`. `url` is `https://2gis.ru/vladivostok/geo/<object_id>`.
- **`GET /areas/geometry-lookup?q=`** searches OpenStreetMap only inside the service region
  (`OSM_BBOX`, Nominatim `bounded=1`); with `lat`/`lng` the nearest candidates come first. Candidate
  titles are the object's own name («Нагорный парк»), not the full address chain. For `object_id`
  the title is the 2GIS name, else its full name, else its address.
- **External reviews (experiment)**: every area qualifies; places qualify when their layer is `tourism`
  or `infrastructure` and their title is a real name — not the category name and not a title the
  OpenStreetMap import generated for an unnamed object («Детская площадка», «Общественный туалет»).
  Other places answer `{enabled: true, sources: []}` without asking the source. Unknown or hidden ids
  answer 404 while the experiment is on. Automatic matching requires a distinctive name, exact or
  ours extended, close enough (SPEC §20) among the top 5 results; all returned candidates can
  veto an ambiguous match. Generic names, partial names, businesses carrying the name and nearby
  competing branches yield no source entry, including ratings/photos. Explicit 2GIS IDs use a geographic sanity check instead of name search.
  Old cache entries without current identity evidence are hidden. A captcha, a refused request or
  an unreadable answer ends only that target's lookup; it is asked again after an hour (a source is
  never switched off as a whole); "no match" is cached like a match. `photos` are the organisation's photos at the source.
- **Free texts** (SPEC §19, §21): `description_credit` is present while the description is not empty
  and came from Wikivoyage («Викигид») or Wikipedia («Википедия»), both CC BY-SA 4.0, `url` = the
  article. Imports never overwrite resident text: a guide's text fills an empty description or
  replaces one an OSM import generated (untouched by moderators); a Wikipedia summary (first
  paragraph, ≤ 600 characters) fills only empty ones; the first credited text wins. An OSM re-import
  keeps such a description.
- **Wikivoyage layer** (SPEC §21): imported places have `external.source = "wikivoyage"`, label
  «Викигид», `url` = the article, author «Викигид» (system account), status `preliminary`
  (`origin=external` includes them). A listing that describes an existing place or area is not a
  place of its own: it fills what is missing there (description as above, opening hours, address).
- **Interests** (SPEC §23): `PUT /me/interests` ignores repeated slugs (more than 13 entries → 422).
  `topics` on `GET /areas`, `GET /areas/{id}` and `GET /recommendations` is used when the caller is
  anonymous or signed in without a profile yet; an unknown slug there → 422. `AreaDetail.topics` and
  `PlaceDetail.topics` list topics of weight ≥ 0.3. `GET /recommendations` answers `personalized: true`
  with `items: []` when there is a profile but nothing matches well enough; the events scope also leaves
  out events the caller already joined. `Recommendation.area.personal_interest` is filled for the same
  profile. Signals from favourites, collections, reviews and event participation are recorded after the
  action succeeded and never change its response.
- **Screening** (SPEC §24): everything a non-moderator publishes or changes — places, public
  routes, photos (each on its own, including `POST /places/{id}/photos` on any place), comments,
  reviews with text, notes — is invisible to everyone but its author and moderators until the
  checks pass; publishing still answers at once. During the screening window (a few seconds) the
  author sees it as published: the same `status`, lists, counters (`comments_count`,
  `rating_avg`/`rating_count` of `PlaceDetail`, profile `stats`); moderators see the real status
  (`pending`). When the window ends in a hold, the author sees the truth: a place or route is
  `pending` for them too (cards, lists, counters) with `screening_hold.reasons`; a held place gets
  a history entry «Публикация отправлена на проверку автоматическим фильтром»; a held photo,
  comment, review or note stays visible to them with `on_review: true`; and they get one
  `moderation` notification per hold («Публикация «…» не прошла автоматическую проверку», the
  reasons, «Пока её видите только вы — модератор посмотрит и решит.»). A moderator's `approve` of
  a held place or route is an ordinary approval with its notification and history entry.
  Others get 404 for the item and never see it in a list, a count, a cover, an area, search,
  statistics or recommendations. A territory
  notification, the comment notification to the place's author and a photo's
  «Добавлено фото» history entry are sent when the item is released. Without an OpenRouter key
  the checks resolve inside the request.
- **Mashed address**: `POST /places` / `PATCH /places/{id}` answer 422 `validation_error` with
  `errors: [{field: "address", message: "Адрес похож на случайный набор букв — поправьте его или
  оставьте тот, что определился по точке."}]` when only the address looks like keyboard mashing.
- **Masking** (SPEC §24.5): profanity in user-written text is masked in every response
  («х*й») for everyone except the text's author and moderators: place title, address, tags,
  description, tips, text attributes, event `price_note` / `contact`, issue `official_note`,
  route and stop texts, comments, reviews, notes (`text`, `object_name`), collections, area
  titles and descriptions, `display_name` and `bio`, notification titles and bodies, history
  messages. `UserMe` is never masked. Stored text and search (`q`) use the original.
