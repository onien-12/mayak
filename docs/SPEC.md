# «Маяк» — народная карта Владивостока

Product + domain specification. Source: hackathon brief «Вайбатон» (interactive map of
Vladivostok's urban environment, filled in by residents). This file is the single source of
truth for **business rules**; `API.md` is the single source of truth for the **HTTP contract**;
`FRONTEND.md` for UI structure and design.

All user-facing text (UI, API error messages, seed content, notifications) is **Russian**.
Code, identifiers, comments, commit messages are **English**.

## 1. Scope

One map, four layers, one trust system.

| Layer (`layer`)   | What                                   | Lifetime                                           |
|-------------------|----------------------------------------|----------------------------------------------------|
| `infrastructure`  | toilets, water, first aid, ramps, sport grounds … | permanent until proven gone               |
| `event`           | city events + small user meetups       | temporary; auto-archived after `ends_at`           |
| `tourism`         | local-knowledge places + author routes | permanent, re-verified over time                   |
| `issue`           | municipal problems, utility outages    | own lifecycle: detected → … → resolved             |

Everything on the map is a **Place** (one table, one card, one verification mechanism) with
optional 1:1 extensions: `EventDetails` (layer `event`) and `IssueDetails` (layer `issue`).
**Routes** are a separate entity: an ordered list of places.

In scope: map with filters, adding places, collective verification, reviews, comments,
complaints, events with join/leave, issues lifecycle, route builder (routing on OpenStreetMap data), favorites
and collections, reputation / levels / respects / cold mode, automatic + manual moderation with
audit log and appeals, in-app notifications, territory subscriptions, city statistics.

Out of scope (documented as future work): e-mail confirmation (no SMTP), communities/clubs,
lost & found, municipal integrations, push notifications, historical map mode.

## 2. Roles and levels

`role`: `user | moderator | admin`. Moderators and admins can use the moderation panel and
edit official issue info.

`level` is derived from `reputation` (integer, can be negative):

| Level       | Reputation | Vote weight | Publishing                                   | Places / day |
|-------------|-----------:|------------:|----------------------------------------------|-------------:|
| `newcomer`  | < 10       | 0.5         | published as `unverified` once the automatic check passes (**probation**, below) | 3 |
| `resident`  | 10 – 49    | 1.0         | published immediately as `unverified`        | 10           |
| `trusted`   | 50 – 149   | 1.5         | published immediately as `unverified`        | 30           |
| `expert`    | ≥ 150      | 2.0         | published immediately as `preliminary`       | 100          |

Moderator/admin vote weight: 3.0, publishing like `expert`.

Newcomer: may vote, review (5/day), comment, complain (5/day), join events, save favorites;
cannot send respects; places are limited to 3 a day. **Probation** (since 2026-11-13, replaces
the earlier pre-moderation of everything a newcomer publishes): a newcomer's place or route is
published like anyone's when the automatic check (§24) passes it, but gets no benefit of the
doubt — whatever the model doubts (`suspicious` of any confidence), holds, or could not check
at all (no answer, no key, daily limit) goes to a moderator instead of being shown. Comments,
reviews, notes and photos added to other places are judged as for everyone. No level is
pre-moderated as a whole any more; `permissions.publishes_directly` is true for all, the
`premoderation` trigger and the `moderation_approved` reward remain for data created earlier. Accounts younger than 24 h have their vote weight halved again (0.25) — protection
from coordinated fresh accounts.

## 3. Trust model for places

### 3.1 Verification votes

One active vote per (user, place): `present` | `absent` | `unclear`
(«Присутствует» / «Отсутствует» / «Требует уточнения»). Voting again replaces the previous
vote and refreshes its timestamp; a vote can be taken back (the place is recomputed without it, the
reward for a first vote is not given twice). Authors cannot vote on their own places. In the card
the three vote buttons carry the counts themselves — there is no separate row of counters.

«Требует уточнения» must say what is unclear (at least 5 characters: «вход со двора, по
выходным закрыто»). The words are for the moderators, not for the card: the vote opens (or joins)
a moderation case with the trigger `clarification`, where every such note on the place is listed
with its author. The place keeps its status — a question is not a reason to take it off the map;
the moderator corrects the publication or dismisses the case.

Vote weight = `level weight` × `1.25 if the voter's coordinates are within 300 m of the place`
× `time decay 0.5^(age_days / 180)`.

Let `P`, `A`, `U` be the summed weights of present / absent / unclear votes and `a` the
author prior (author level weight × 0.5, frozen at creation).

```
confidence  = (a + P) / (a + P + 1.5·A + 0.5·U + 1)
freshness   = 0.6 + 0.4 · 0.5^(days_since_last_confirmation / 365)   # last present vote, else created_at
trust_score = round(100 · confidence · freshness)                    # 0..100
```

A place is **stale** when the last confirmation is older than 180 days (card shows a warning
«давно не проверялось»).

### 3.2 Status

`status`: `pending | unverified | preliminary | verified | needs_review | hidden | archived`

- `pending` — waiting for pre-moderation, or held by the automatic check (§24.1); visible only
  to author and moderators. During the few seconds of a screening window the author still sees
  the status the place will get.
- `unverified` — just added, no independent confirmations.
- `preliminary` — first confirmations (`P ≥ 1.0`).
- `verified` — enough independent confirmations (`P ≥ 4.0` **and** ≥ 3 distinct present voters, `P > 2·A`).
- `needs_review` — contradictory signals; stays on the map with a warning; a moderation case is opened.
- `hidden` — removed from the map due to serious doubts (moderator decision or strong absent signal).
- `archived` — no longer exists / lost relevance; kept for history.

Automatic derivation after every vote/complaint (never overrides `pending`, `hidden`,
`archived`, which only moderators / lifecycle change):

1. `A ≥ 6.0` and `A ≥ 2·P` → `hidden` (+ case, trigger `absent_votes`)
2. `A ≥ 3.0` and `A > P` → `needs_review` (+ case, trigger `absent_votes`)
3. open complaints weight ≥ 3.0 → `needs_review` (+ case, trigger `complaints`)
4. verified rule → `verified`
5. `P ≥ 1.0` → `preliminary`
6. otherwise → `unverified`

Status of a publication and reputation of its author are **different things** and are shown
separately.

Every status change, edit, moderation decision and issue stage change is written to
`PlaceHistory` (shown in the card as «История»).

### 3.3 Issues reuse the same votes

For layer `issue`: `present` = «проблема есть», `absent` = «устранено», `unclear` = «ситуация изменилась».

`stage`: `detected → confirmed → forwarded → in_progress → resolved`

- `detected → confirmed` automatically when `P ≥ 2.0`.
- `forwarded`, `in_progress` — set by moderators (official info).
- `→ resolved` automatically when `A ≥ 3.0` and `A > P` counted over votes cast after the last
  stage change, or by a moderator. Sets `resolved_at`; resolved issues leave the default map and
  stay in history (`include_resolved=true`).
- Rules 1–2 of §3.2 are **not** applied to issues (absent votes resolve instead of hiding).

`source`: `user | official`. User reports are explicitly shown as «сообщение жителей, не
подтверждено официально». Moderators can attach official info (`official_note`,
`expected_fix_at`, `appeal_number`, `responsible_org`) which switches `source` to `official`.
Utility outages may have `radius_m` — the affected area drawn as a circle.

### 3.4 Events

`phase` is computed, never stored:

```
cancelled  if is_cancelled
finished   if now > ends_at
ongoing    if starts_at ≤ now ≤ ends_at
soon       if starts_at − now ≤ 3 h
closed     if registration_closed or (capacity and participants_count ≥ capacity)
open       otherwise
```

Finished events disappear from the default map/afisha but are never deleted (`scope=past`).
Meetups (`is_meetup=true`) are small user gatherings with `capacity`; organizer's `contact` is
visible only to participants. Joining is impossible when phase is `closed | finished |
cancelled`. Changing time or cancelling notifies all participants. Recurring events: creating
with `repeat` produces a series of independent places sharing `series_id`.

## 4. Reputation

Every change is recorded as a `ReputationEvent` (`delta`, `reason`, optional `place_id`).

| Reason (`reason`)        | Δ    | When                                                              |
|--------------------------|-----:|-------------------------------------------------------------------|
| `vote_cast`              | +2   | verification vote (first vote per place; max 10 rewarded per day) |
| `place_verified`         | +10  | own place reaches `verified` (once per place)                     |
| `place_preliminary`      | +3   | own place reaches `preliminary` (once per place)                  |
| `issue_resolved`         | +5   | own issue report resolved by the community                        |
| `route_published`        | +5   | own route published (max 2 per day)                               |
| `review_written`         | +1   | review (max 5 rewarded per day)                                   |
| `respect_received`       | +3   | another user sent a respect                                       |
| `complaint_upheld`       | +3   | own complaint upheld by a moderator                               |
| `complaint_dismissed`    | −1   | own complaint dismissed                                           |
| `content_rejected`       | −15  | own publication rejected / hidden by a moderator                  |
| `place_hidden_auto`      | −10  | own place hidden by strong absent signal                          |
| `moderation_approved`    | +4   | own pre-moderated publication approved                            |

Level-up produces a notification. Respects: one per (from, to) pair ever, max 5 sent per day,
not to yourself, sender must be at least `resident`.

## 5. Anti-abuse limits

Violations return HTTP 429 with a Russian explanation.

- Place creation: daily limit by level (§2); cooldown 20 s between creations; at most 3 places
  by the same author within 150 m during 24 h.
- Votes: 60 per hour. Complaints: 5/day newcomer, 20/day others; one open complaint per
  (user, target). Reviews: one per (user, place) (upsert). Comments: 30 per hour.
- Auth endpoints: per-IP sliding window (10 registrations/hour, 30 logins/10 min).
- Registration: server-side arithmetic captcha (signed token, 5 min TTL) + honeypot field.

Complaint weight = reporter level weight × reason weight
(`inaccurate` 1.0, `outdated` 0.8, `duplicate` 0.6, `spam` 1.2, `offensive` 1.2, `rules` 1.0,
`fraud` 1.5, `impassable` 1.0 — routes only).

## 6. Automatic content checks

Run on create/edit of places, routes, reviews and comments. Checks never reject by
themselves: they produce **flags**; a flagged publication goes to `pending` with a moderation
case (trigger `auto_text` / `auto_image`). Reviews/comments with flags are rejected with 422
and a hint (cheap to retype). Profanity is not a flag: it is masked on display (§24.5);
keyboard mashing holds the item (its author is told why) and a mashed address is refused (§24.1).

Text flags: more than 2 links or a link shortener; shouting (> 70 % caps in ≥ 20 letters) or
long character repeats; duplicate (same author + same title in 24 h, or same title within 50 m).
Image checks on upload: real image (Pillow verify), ≤ 8 MB, JPEG/PNG/WebP; re-encoded to JPEG
≤ 1600 px; SHA-256 stored; the same image attached to > 3 different places → flag.

## 7. Moderation

A `ModerationCase` targets a place or a route; one open case per target (new triggers are
merged into it). Triggers: `premoderation`, `complaints`, `absent_votes`, `auto_text`,
`auto_image`, `auto_ai`, `appeal`, `clarification` (§3.1). A photo, comment, review or note held
by the automatic check gets a case of its own, listed apart from the queue with two outcomes,
`release` and `remove`, each notified to its author (§24.1).

`risk` (0..100) = weighted sum: complaints weight, absent weight, auto flags, author level
(newcomer riskier), layer (`issue`/`event` slightly riskier because time-sensitive).

Moderator actions (each requires a reason and is written to the immutable moderation log):

| Action            | Effect                                                                                  |
|-------------------|-----------------------------------------------------------------------------------------|
| `approve`         | status recomputed from votes (at least `unverified`); complaints dismissed; author +4 if it was waiting for pre-moderation (a place held only by the automatic check gets back its status without the +4, §24.1); author notified |
| `reject`          | status `archived`; author −15; complaints upheld                                        |
| `request_changes` | stays `pending`; author notified with the reason; editing re-opens a case               |
| `hide`            | status `hidden`; author −15; complaints upheld                                          |
| `restore`         | `hidden`/`archived` → status recomputed from votes                                      |

For routes the same actions map to route status `published | pending | needs_review | hidden`.
Authors of `hidden`/`archived`(rejected) publications can file one **appeal** per decision.

## 8. Notifications

In-app only. Kinds: `event_joined` (to organizer), `event_changed`, `event_cancelled` (to
participants), `comment` (to author), `respect`, `moderation` (decision on own content),
`place_verified`, `level_up`, `issue_update` (stage change, to author and voters), `territory`
(new published place inside a subscribed circle).

## 9. Catalog (seeded, extensible)

Categories live in the DB (`slug`, `layer`, `group`, `name`, `icon`, `fields`). `fields` is a
JSON schema-lite list that drives the create form, the card and attribute filters:
`{key, label, type: boolean|number|text|select, options?: [{value,label}], unit?}`.

Seed slugs (frontend maps slug → icon/color, unknown slugs fall back to the layer icon):

- **infrastructure** — «Санитарно-бытовые»: `toilet`, `shower`, `baby_room`, `drinking_water`;
  «Медицина»: `first_aid`, `defibrillator`, `first_aid_kit`;
  «Доступная среда»: `ramp`, `elevator`, `accessible_crossing`, `accessible_parking`, `accessible_entrance`;
  «Общественные»: `public_space`, `rest_place`, `charging`, `wifi`, `library`;
  «Спорт и отдых»: `sports_ground`, `basketball`, `football`, `skatepark`, `workout`, `table_tennis`.
- **event** — `culture`, `city`, `sport`, `education`, `entertainment`.
- **tourism** — `historic`, `architecture`, `food`, `nature`, `viewpoint`, `unusual`, `culture_space`.
- **issue** — `utilities`, `roads`, `improvement`, `hazard`, `public_space_issue`.

Typical fields: `toilet` → `free` (boolean «Бесплатный»), `price` (number ₽), `accessible`
(boolean «Доступен для маломобильных»), `changing_table` (boolean), `hours` (text «Режим работы»),
`condition` (select good/ok/bad). `first_aid`/`defibrillator` → `hours`, `access`, `info_source`.
`utilities` → `service` (select electricity/water/heating/gas/other), `cause` (text).
Sport categories → `lighting`, `surface`, `free`. `food` → `avg_check`, `cuisine`, `hours`.
`nature`/`viewpoint` → `difficulty` (select easy/medium/hard), `parking` (boolean).
Wherever it makes sense include `free`, `accessible`, `hours` with exactly these keys so the
«бесплатно» / «доступная среда» quick filters work across categories.

## 10. Seed data

On first start (empty DB) the backend seeds: the catalog, demo users, and a believable slice
of Vladivostok — ≥ 70 places with **real coordinates** across all layers and districts
(центр, Эгершельд, Первая/Вторая Речка, Чуркин, о. Русский), votes, reviews, comments, events
dated relative to "now" (ongoing, today, this weekend, next weeks, a few finished, one
recurring series, several meetups with free seats), issues at every stage (incl. an official
water outage with radius), ≥ 4 author routes, public collections, moderation cases (a pending
newcomer place, a complained place, an appeal), notifications for the demo user.

Demo accounts (password for all: `mayak2026`):

| E-mail                  | Name               | Role / level        |
|-------------------------|--------------------|---------------------|
| `admin@mayak-vl.ru`     | Администратор      | admin               |
| `moderator@mayak-vl.ru` | Марина Модератор   | moderator           |
| `expert@mayak-vl.ru`    | Олег Сопкин        | expert (≈ 210)      |
| `demo@mayak-vl.ru`      | Аня Приморская     | trusted (≈ 72)      |
| `resident@mayak-vl.ru`  | Дима Чуркин        | resident (≈ 18)     |
| `newcomer@mayak-vl.ru`  | Новичок            | newcomer (0)        |


Seed reputations are backed by `ReputationEvent` rows so profiles look alive.

## 11. External source: Афиша VL.ru

**The section is «События», and residents' events lead (since 2026-11-13).** The section that
lists events is called «События» in the UI (it was «Афиша»). It opens on what residents arrange
themselves — events and meetups (`origin=community`); the imported city listings below are one
filter away («Все» / «Афиша VL.ru»), and an empty residents' feed offers both to gather a
meetup and to show the city listings. A new event is a small meetup by default.

City events are imported from `https://www.vl.ru/afisha/vladivostok` so the afisha is alive
from day one; user-created events and meetups live next to them.

- Imported events are ordinary `event` places authored by a system user «Афиша VL.ru»
  (`afisha@mayak-vl.ru`, cannot log in) with `external = {source: "vl_ru", label: «Афиша VL.ru», url}`
  and `registration_url` = the original page. The UI marks them as imported — «VL.ru» on the
  cover in lists; in the card the link «Подробности и билеты на VL.ru», the source in the card
  menu («Источник: Афиша VL.ru») and in «Достоверность» — external source ≠ user content ≠
  official info (brief §7.3).
- Trust: a trusted external source acts as a baseline confirmation — `EXTERNAL_SOURCE_WEIGHT = 4.0`
  is added to `P` and satisfies the distinct-voters requirement, so imported events start as
  `verified`; absent votes and complaints still work as usual.
- No pre-moderation, no reputation for the system user, limits do not apply.
- Users can join («пойду») imported events; `capacity` is null; `price` is null when unknown
  (`price_note` keeps the source text such as «от 1500 до 3000 ₽»).
- Idempotent upsert by `external_id` (`vl_ru:<event id>`): re-import updates title, dates,
  venue, image, price; an event edited by a moderator locally is not overwritten.

How the source is read (verified on 2026-11-11; `robots.txt` allows these paths, disallows
`?page=`, `by-dates-`, `search?query=`):

- Listing pages `…/afisha/vladivostok` and `…/afisha/vladivostok/events/by-category-<slug>`
  (slugs: `concert`, `theatre`, `exhibition`, `standup`, `party`, `masterclasses`, `education`,
  `child`, `city-event`, `quest`, `tours`, `extreme`, …) contain links `/afisha/vladivostok/event/<id>`
  and one `application/ld+json` `Event` per card (name, startDate, endDate — dates only,
  location name + address, image). The listing a link was found on gives the category.
- Event page `…/event/<id>`: JSON-LD `Event`; `window.EVENT_LOCATION = { locations: [{title,
  address, latitude, longitude}] }` (coordinates!); schedule rows `.info-program__item-date` /
  `.info-program__item-time` (session dates and times, «пт 18 дек. 11:00»); age in
  `.event__description` («Возраст: 0+»); description text; price text like «от 11000 до 13000 ₽».
- Category mapping → our event categories: concert/theatre/exhibition → `culture`;
  city-event/child → `city`; extreme/sport → `sport`; masterclasses/education/tours → `education`;
  standup/party/quest and unknown → `entertainment`.
- Times are Vladivostok local (UTC+10). `starts_at` = next upcoming session (date + time, or
  00:00 when no time); `ends_at` = end of `endDate` day for multi-day events, else start + 2 h.
- Politeness: descriptive User-Agent, ≤ 1 request/second, timeout 15 s, at most ~150 events per
  run, skip finished events, tolerate any single-page failure. Images are hot-linked
  (`cover_url` = source image URL), not copied. Descriptions are stored truncated (≤ 600 chars)
  with a link to the original.
- Runs: CLI `uv run python -m app.afisha_import`; background task on startup and every 12 h
  when `AFISHA_IMPORT_ENABLED=true` (default true, never blocks startup, never fails the app).
  Parser is pure and unit-tested on saved HTML fixtures; tests never touch the network.

## 12. Routes — builder for city walks and trekking

Any registered user can build a route. A route is an ordered list of **custom waypoints**
(title, coordinates, description, landmark «ориентир», photos, stay time, kind), each optionally
linked to a map place. `via` waypoints are invisible shaping points for trails.

- `visibility`: `private` («только для меня» — a personal plan, never moderated) or `public`
  (published to everyone under the §2 rules; a newcomer's route is on probation like a place).
- `path_mode`: `roads` (routed along streets, footways and trails from OpenStreetMap — the
  FOSSGIS OSRM service; 2GIS Routing is an optional provider) or `direct` (straight segments —
  for terrain without paths; the author shapes the track with `via` points). The line credits
  «© участники OpenStreetMap».
- Meta: kind (walk/car/bike/hike/excursion), difficulty, tips (what to take, season), tags.
- Each stop knows `distance_from_prev_m`; the route knows total distance, travel time, total time.
- Take-away formats: GPX export (works in any navigator / tracker app), a print-friendly page
  (map + numbered legend with photos, landmarks, distances between points, QR code back to the
  route) that also saves to PDF, and «сохранить себе» (favorites).
- «Пройти маршрут» mode on the phone: current stop, landmark to the next one, distance to it
  from the user's geolocation, progress.

## 13. Tap anywhere: the "spot" sheet and notes

Tapping any point or any 2GIS object on the map (building, organisation, park, stop) opens a
**spot sheet** — the fastest way to contribute:

- header: name and address of the tapped object (2GIS object under the tap, else reverse
  geocoding, else plain coordinates); the object is highlighted on the map;
- **notes** («заметки») — short public comments pinned to this object/point: «вход со двора»,
  «тут бесплатная вода у охраны», «лифт не работает с октября». A note belongs to the 2GIS
  object when there is one (all notes of a building are one thread), otherwise to the
  coordinates (thread = notes within 40 m);
- what the map already knows here: places within 80 m (all layers);
- actions: «Заметка», «Добавить место здесь», «Встреча здесь», «Сообщить о проблеме» — the
  create flow starts prefilled with the point and address.

Notes are deliberately lightweight: text only (≤ 500 chars), no verification votes, no
reputation. Protection: automatic text checks, daily limits, reports (3 distinct reports hide
a note), author/moderator delete. Notes are shown on the map as small bubbles with a counter
at high zoom and can be switched off in the filters.

2GIS quota: object info is fetched once per explicit tap (Places `items/byid` for an object
id, reverse geocoding otherwise), cached by id / rounded coordinates; failure degrades to
coordinates only.

## 14. LLM pre-screening (OpenRouter)

Cheap LLM review complements the heuristic checks of §6. It is an **advisor**: it can raise
flags and keep content out of public view pending a human look, but it can never approve,
reject, permanently hide or change anyone's reputation (brief §5.10). What it decides and when
is now §24; this section keeps the provider, the input and the hardening.

- Provider: OpenRouter chat completions (`https://openrouter.ai/api/v1/chat/completions`),
  model `deepseek/deepseek-v4.1-flash` (text + image input, structured outputs). Settings:
  `OPENROUTER_API_KEY`, `LLM_MODERATION_MODEL`, `LLM_MODERATION_ENABLED` (default: on when a
  key is present), `LLM_MODERATION_IMAGES` (default true), `LLM_MODERATION_DAILY_LIMIT`
  (default 2000 calls/day). No key → feature silently off, heuristics only.
- What is reviewed: public places (all layers) and public routes on create/edit; notes,
  comments, reviews on create and edit; every photo a person attaches (§24.2). Never: private
  routes, imported content, seed data, moderators' own content.
- When: asynchronously after the write succeeds (background task with its own DB session) —
  publishing is never slowed down by the LLM; until the check is done the item is visible only
  to its author, who sees it as published (§24.1). Timeout 20 s, one retry, any failure → the fallback of §24.1 (logged).
- Input: layer, category name, title, description, tips, address, tags, attributes; for routes —
  title, description, stop titles/notes/landmarks. Photos go one per request (§24.2), never with
  the text. No e-mails, user ids or other personal data of the author are sent.
- Output: strict JSON schema (`response_format: json_schema`, temperature 0):
  `{verdict: ok|suspicious|violation, categories[], confidence 0..1, usefulness 0..100, summary
  (Russian, ≤ 300 chars)}`; a photo check has no `usefulness` and categories of its own (§24.2).
  Stored as `AiReview` (per target, photos included) and shown to moderators in the case page.
- Prompt-injection hardening: user content is passed as clearly delimited data, the system
  prompt states that instructions inside it (or written inside a photo) must be ignored, the
  response is validated against the schema (invalid → discarded, unknown categories dropped,
  numbers clamped). Because the LLM can only *add* suspicion, the worst a successful injection
  can do is suppress a hold — the same as having no LLM.
- Effects: §24.1. `ok` releases (an open pre-moderation case gets a lower `risk`); `suspicious`
  below 0.6 releases with status `needs_review` and a case `auto_ai` (stays visible with a
  warning); stronger doubt, any `violation` and low usefulness hold the item — the author is
  notified once, with the reasons in plain words (§24.1).
- Tests use a fake client; the network is never touched. The seed does not call the LLM; it
  inserts a few sample `AiReview` rows for the demo moderation cases.

## 15. External source: utility outages from VL.ru

Current water / heat / electricity outages are imported from `https://www.vl.ru/off/` and shown
on the `issue` layer with house-level precision. Aggregation works both ways: **by outage**
(one card per outage with all its houses) and **by address** (one dot per house with all its
outages; «проверить мой адрес»).

Source pages (verified 2026-11-11; `robots.txt` disallows `/off/map/` and `/off/blackout/` —
never fetch those):

- `https://www.vl.ru/off/summary/map?date=now` — HTML with an embedded JSON string containing
  `blackouts: {<id>: {type, description}}` and `buildings: {<id>: {address, slug,
  coordinates: [lng, lat], claimsCount, types: [...], blackouts: [<id>, ...]}}`. This is the
  main source: exact house coordinates and the house → outage mapping. (Sample with
  `&resourceType=cold_water` saved; check whether the unfiltered URL returns all resources,
  otherwise request the 4 resource types: `cold_water`, `hot_water`, `heat`, `electricity`.)
- `https://www.vl.ru/off/summary/blackouts?date=now` — list of outages: `.blackout-summary-blackouts__item`
  with resource (`.blackout-summary__resource-icon_<type>`), `.blackout-summary-blackouts__dates`
  («11 ноя. 12:23 — 11 ноя. 14:00»; end is optional; Vladivostok time, UTC+10),
  `.blackout-summary-blackouts__count` (duration, «8 адресов», «19 жалоб»), description with
  the number («№169684», link to the blackout page), `.blackout-summary-blackouts__initiator`
  (organisation or «-»).

Mapping — one place per outage (`external_id = vl_ru_off:<number>`), authored by the system
user «Отключения VL.ru» (`off@mayak-vl.ru`, cannot log in):

- `title`: «Нет холодной воды: Тухачевского ул., Сельская ул. и ещё 3 улицы» (streets ordered by
  house count); `address`: district/street summary; `description`: source description;
  category `utilities`, `attributes.service` = resource (`cold_water | hot_water | heat |
  electricity`; the category's `service` select must offer these values plus `gas`, `other`).
- Position: the affected house closest to the centroid; `radius_m` = distance to the farthest
  house (clamped 60..3000). `outage_buildings` = all houses.
- `issue.source` = `official` when an organisation is named (also → `responsible_org`),
  otherwise `user` (VL.ru built it from residents' complaints); `stage` = `in_progress` when an
  organisation is named, else `confirmed`; `detected_at` = start; `expected_fix_at` = planned
  end; `severity`: ≥ 50 houses `high`, ≥ 10 `medium`, else `low`.
- `external` = `{source: "vl_ru_off", label: «Отключения VL.ru», url: https://www.vl.ru/off/blackout/<number>.html}`
  (a link for people; the importer itself never requests it). Trust as in §11 (`verified`).
- Lifecycle is owned by the import: an outage that disappears from the source → `resolved`
  (`resolved_at` = import time, leaves the default map, stays in history). User votes on
  imported outages are recorded and shown but do not change the stage.
- Refresh: on startup and every 20 minutes (2–5 requests per run, ≤ 1 request/second),
  `OUTAGES_IMPORT_ENABLED` (default true), CLI `uv run python -m app.outages_import`. Same
  rules as §11: pure parsers tested on saved fixtures, never blocks or crashes the app,
  disabled in tests, HTML treated as untrusted data.

UI: an «Отключения» section — totals by resource, «проверить адрес» search, list of outages
(most houses first) → the usual issue card with the house list grouped by street; house dots
on the map at high zoom (colour by resource, one dot per house even with several outages); the
spot sheet (§13) tells if the tapped house currently has an outage.

## 16. Home area and local knowledge (internal trust signal)

People know their own neighbourhood best: whether the water is off in their house, whether the
yard playground is broken, whether the toilet round the corner still works. A vote about such
things from someone who lives there is worth more than a vote from across the city. This is an
**internal anti-abuse / quality signal**: the weights, the confidence value and the very fact
that home affects vote weight are never exposed through the API or explained in the UI.

### What the user sees

An optional «Мой район» setting: pick a point on the map. The stated, real benefits: the map
opens around home, a «рядом с домом» shortcut, and automatic notifications about outages and
events nearby (an automatic territory subscription «Мой район», 1 km, layers `issue` +
`event`). Privacy copy (neutral, mandatory): «Видно только вам. Используем для подсказок рядом
с домом и для повышения достоверности карты.» The point is stored rounded to 3 decimals
(~100 m), returned only in the owner's `UserMe`, invisible to other users and to moderators,
and can be removed at any time.

Anti-gaming: the first setting is free; afterwards the home can be changed once per 30 days
(`can_change_at`). Changing it resets the tenure component of the confidence.

### Home confidence `c` ∈ [0, 1] (stored on the user, recomputed after each of their votes and on home change)

How much the system believes the declared home:

```
geo      = min(1, D / 4)        D = distinct days with a geo-confirmed vote (voter was within 300 m
                                of the place) on a place within 1 km of home
tenure   = min(1, T / 30)       T = days since the home was set
local    = min(1, N / 8) · R    N = votes on places within 1.5 km of home; R = share of them that agree
                                with the current community outcome (present ↔ preliminary/verified,
                                absent ↔ hidden/archived/resolved); R = 0.5 when the outcome is undecided
elsewhere = share of the user's geo-confirmed votes cast farther than 5 km from home (0 if < 5 such votes)

c = clamp(0.2 + 0.3·geo + 0.2·tenure + 0.3·local − 0.3·elsewhere, 0, 1)      # 0 when no home is set
```

A freshly declared home is worth little (0.2); it becomes credible through real, located,
accurate activity around it and through time. Someone who "lives" in one district but is only
ever physically seen in another loses confidence.

### Locality factor on vote weight

Applied to verification votes (and to the author prior of a new place) **only for content that
residents know better than passers-by**. Sensitivity `s` by content:

| Content | `s` |
|---|---:|
| `issue` / `utilities` (outages: water, heat, electricity, gas) | 1.0 |
| other `issue` categories (roads, improvement, hazards, public spaces) | 0.6 |
| `infrastructure` | 0.4 |
| `tourism`, `event` (people walk around and visit) | 0 |

```
p = 1                               if d ≤ 0.5 km          d = distance from home to the place
    exp(−(d − 0.5) / 1.5)           otherwise              (≈ 0.5 at 1.5 km, ≈ 0.1 at 4 km)
e = c · p                           # evidence that the voter lives near this place; 0 without a home
local_factor = 1 + s · (0.5·e − 0.4·(1 − e))
```

So for an outage: a confirmed local resident ×1.5, an unknown or distant voter ×0.6; for a
toilet or a ramp: ×1.2 … ×0.84; for events and tourism: always ×1. Declaring a home never
lowers anyone's weight compared to not declaring one (no incentive to hide it), and a false
home far from one's real activity earns nothing.

Final vote weight = level weight × fresh-account factor × geo-proximity bonus (×1.25 when the
voter is physically within 300 m) × `local_factor`, frozen at cast time. The physical-presence
bonus and the locality factor are independent: a visitor standing next to a dark house still
counts, just less than a resident.

Imported outages (§15) are unaffected (their stage is owned by the import). Complaint weights
are unaffected.

## 17. Areas — the location is the hero, concrete places live inside it

The map should first answer "where is it worth going", not list every gazebo. A **location**
(`Area`: «Нагорный парк», «Спортивная набережная», «кампус ДВФУ», «Токаревская кошка») is the
primary object; concrete places («Беседка с видом», «Воркаут-площадка», «Питьевой фонтанчик»)
belong to it and are browsed inside its card.

- An area is a named territory with an **exact polygon** (GeoJSON `Polygon`/`MultiPolygon`) —
  essential for elongated shapes such as embankments and for expanding to other cities — plus a
  `kind`, description and optionally the linked 2GIS object (`object_id`). `lat`/`lng` is a label
  point guaranteed to lie inside the territory; `radius_m` is its bounding radius.
- Where the polygon comes from, in order of preference:
  1. the tapped 2GIS object's own geometry (2GIS Places `items/byid` with
     `fields=items.geometry.selection`, WKT `POLYGON`/`MULTIPOLYGON` — verified available on our key);
  2. a boundary found in OpenStreetMap by name (Nominatim `polygon_geojson=1`; e.g. «Нагорный
     парк» returns a 34-vertex park polygon) — ≤ 1 request/second, descriptive User-Agent,
     cached; OSM-derived shapes carry the attribution «© участники OpenStreetMap» (ODbL), which
     the app shows in the area card and the README credits;
  3. drawn by hand on the map (tap to add vertices, drag to adjust) — always available, the
     way to do embankments and anything the sources do not know;
  4. a circle (centre + radius) as the quick fallback, stored as a polygon.
  Lookups (1–2) go through the backend (`GET /areas/geometry-lookup`) so keys, caching, WKT
  parsing and politeness live in one place; the result is always editable by hand before saving.
- Geometry rules: validated (closed, no self-intersections, sane size), simplified to ≤ 200
  vertices for transfer, and nothing in the model is Vladivostok-specific.
- Membership: a place gets `area_id` automatically on create/edit — the area whose polygon
  contains the point (the smallest by territory when nested). The create form offers no choice: it
  only names the location the point falls into, and says nothing when there is none («Добавить
  место сюда» from a location's card keeps that location). The edit form can still move the place
  to another area or make it a standalone point. Creating/changing an area re-attaches the
  places inside. Places outside any area stay standalone, exactly as before.
- **Interest** (0..100) — "how much is there and how good is it", recomputed whenever a place
  inside changes status/rating, is added or removed:

  ```
  w(place)  = status factor (verified 1.0 · preliminary 0.7 · unverified 0.4 · needs_review 0.2)
              × (1 + (rating_avg − 3) / 4 when rated, else 1)        # infrastructure + tourism only
  W         = Σ w(place) + 0.3 · (distinct categories − 1) + 0.5 · upcoming events inside
  interest  = round(100 · (1 − exp(−W / 5)))
  ```

  Shown to people as a label plus the plain count: < 25 «Пока мало отмечено», < 50 «Есть что
  посмотреть», < 75 «Интересное место», ≥ 75 «Очень интересно» — «Нагорный парк · 12 мест ·
  Очень интересно». Issues never add interest; they are shown separately («2 проблемы»).
- `highlights` — what is there: top categories by number of places («видовые 3 · спорт 2 ·
  вода 1»). `cover_url` — best photo among the places inside.
- Who creates areas: seeded for the well-known locations of Vladivostok; users of level
  `trusted`+ and moderators can add one (from the spot sheet when tapping a park / embankment /
  square: title and geometry prefilled from the 2GIS object). Duplicates are rejected.
- Map: area markers are larger labelled pills (name + count, interest-tinted) and are the main
  thing visible when zoomed out; the places of an area are **folded into it** until the user
  zooms in (≈ zoom ≥ 15.5) or opens the area — then they appear together with the territory
  polygon (soft tinted fill + outline; all visible territories are faintly tinted from zoom ≈ 14). Tapping a 2GIS object that is linked to an area opens the area, not the spot sheet.
- Area card (`/?area=<id>`): cover mosaic, name, kind, interest meter + label, count, rating,
  "что здесь есть" (places grouped by layer/category → open the place card), upcoming events
  here, open problems here, notes of the linked object, «Добавить место сюда». A place card
  shows a breadcrumb chip back to its area.
- Lists (explore, search): areas come first as richer cards; their inner places are not
  repeated in the list while folded.

Seed: ≥ 15 real areas (Нагорный парк, Спортивная набережная, набережная Цесаревича,
Покровский парк, Адмиральский сквер, площадь Борцов Революции, Миллионка, сопка Орлиное
Гнездо, Токаревская кошка, Минный городок, Ботанический сад, кампус ДВФУ, Ворошиловская
батарея, мыс Тобизина, Приморский океанариум …) with real polygons — fetched once from
OpenStreetMap at development time and committed as a seed JSON (never fetched at runtime by
the seed); embankments and anything OSM lacks get hand-made polygons along the real shoreline; the
seeded places inside them are attached by the same automatic rule, and several areas must end
up with 4+ places so the grouping is visible.

## 18. External source: OpenStreetMap (base layer of objects and territories)

OSM is the second data source next to 2GIS: an open database we can take as a whole, with no
request quota. It bootstraps the map with real objects that residents then confirm — which is
exactly what newcomers in cold mode are allowed to do.

- **How it is loaded**: one Overpass query for the city bounding box (or a Geofabrik extract)
  → normalised snapshot JSON committed under `app/seed/` → imported offline on first start.
  Refresh: CLI `uv run python -m app.osm_import [--fetch]` (re-queries Overpass, ≤ 1 request,
  descriptive User-Agent). The runtime never depends on Overpass. Nothing is city-specific:
  the bounding box is a setting.
- **What is taken** (measured for Vladivostok on 2026-11-11: ≈ 3 500 candidate objects):
  toilets (128), drinking water, fountains, shelters, libraries, charging stations,
  defibrillators, fitness stations, sport pitches by `sport=*` (≈ 600), viewpoints (48),
  museums/galleries, attractions, artworks, named `historic=*` (≈ 220), named beaches (52);
  playgrounds (≈ 2 200) go to a new infrastructure category `playground` «Детская площадка».
  Benches and unnamed generic objects are skipped. Tag → category/attribute mapping lives in
  one declarative table (`fee=no` → `free`, `wheelchair=yes` → `accessible`, `opening_hours` →
  `hours`, `changing_table`, `lit` → `lighting`, `surface`, `sport`, `access` …).
- **Territories**: named `leisure=park`, squares, beaches, islands and similar polygons
  (≥ 3 000 m²) become Areas (§17) with their real geometry. Empty imported areas are kept out
  of the zoomed-out map (`min_places=1`) and appear in search and on zoom-in.
- **Identity and trust**: `external = {source: "osm", label: «OpenStreetMap», url: https://www.openstreetmap.org/<type>/<id>}`,
  `external_id = osm:<type>/<id>`, system author «OpenStreetMap». Source weight is per source:
  VL.ru (editorial, live) 4.0 → `verified`; **OSM 1.0 → `preliminary`** («есть в OpenStreetMap,
  жители пока не подтвердили»). Resident votes take it from there; absent votes hide stale
  objects as usual. No reputation, limits or LLM review for the system author.
- **Deduplication**: an OSM object is skipped when a non-OSM place of the same category already
  exists within 40 m (user content always wins); re-import updates only untouched OSM places
  and never resurrects ones the community hid or archived.
- **Licence**: ODbL. The app credits «© участники OpenStreetMap» wherever OSM-derived data is
  shown (place card, area card, about screen) and the README states it. If the platform ever
  publishes its own data dump, the OSM-derived part must stay under ODbL — user contributions
  are stored separately (distinct `external_id`), which keeps that tractable.
- With thousands of places the list endpoints must stay bounded: `GET /places` returns the
  most trusted first when truncated; areas fold their inner places on the map.
- **Bare background objects** — OSM objects nobody has confirmed that have nothing to show for
  themselves: a title that is just the category («Детская площадка», «Спортивная площадка»:
  about 2 700 yard playgrounds and grounds), or a sight (layer `tourism`) with no photo — a lone
  monument, plaque or fountain. They are kept and counted but not drawn on the «Карта» section
  by default. They appear when asked for: their category is chosen, a search matches, or the
  «Всё из OpenStreetMap» filter is on. A photo (residents', archive or borrowed from a map
  service) or one confirmation by a resident makes such an object an ordinary place. Named
  infrastructure from OSM (toilets, drinking water, libraries) stays visible.

## 19. Enrichment from other catalogues — what is allowed and what is not

Product question: can we aggregate reviews and photos from Yandex, Google and 2GIS by parsing them?

**Not by scraping.** Their terms of use prohibit automated collection and re-publication;
review texts and photos are copyrighted user content (and a protected database, ГК РФ ст.
1334), reviewer names/avatars are personal data (152-ФЗ); Google additionally forbids storing
Places content, Yandex exposes reviews only through its own widgets. A platform whose core
promise is trustworthy, traceable information must not be built on taken content.

What we do instead:

1. **Freely licensed photos and short descriptions from Wikimedia** — collected by a dev-time job
   into a committed snapshot (`uv run python -m app.wikimedia_enrich [--fetch]`), never at request
   time, with **few, batched requests** at ≤ 1 request/second and the fixed descriptive User-Agent:
   - Russian Wikipedia `list=geosearch` around a handful of points (10 km circles covering
     `OSM_BBOX`, 6 requests) gives every geotagged article; targets without a Wikidata id are
     matched to them by name (`domain/names`) and distance (200 m for places, the area's radius +
     300 m for areas) — never a place to the article of a location it lies in («Нагорный парк»
     for «Смотровая Нагорного парка»: the article names the whole, `names.names_the_whole`),
     unless the place is named as that location (it is then the location's own object);
   - Wikidata `wbgetentities`, fifty items a request: main image (P18), Commons category (P373),
     the `ruwiki` article — for every id known from OSM `wikidata` tags, Wikivoyage listings and
     the matched articles;
   - Wikipedia `prop=extracts|pageimages|pageprops`, twenty articles a request: the free lead
     image, the Wikidata id and the first paragraph of the introduction (≤ 600 characters);
   - Commons `imageinfo` + `extmetadata`, fifty files a request, for every named file;
   - only areas and notable tourism places still without a photo are then searched one by one —
     their Commons category if they have one, else files geotagged within 150 m (areas: their
     radius, ≤ 1 km) — areas first, at most 150 searches; a 403/429 from a service stops every
     further request to it.
   Kept: JPEG/PNG, short side ≥ 600 px, a free licence, no maps/logos/flags; up to 8 photos a
   place and 12 an area (linked files first, then the nearest geotagged ones — the searches return
   up to twenty files each, so the caps cost no request).
   **Only the object itself** (`domain/archive_photos`, after the first snapshot gave a car, a bird
   and the house next door to places): a photo is kept when the object's own identity leads to it
   — named by its source (OSM tag, the guide's image), the image of its Wikidata item, the lead
   image of its article, a file of its own Commons category — or when its title, description or
   Commons categories name the object: every distinctive word of the name, in Cyrillic or in Latin
   letters, outside an address («ул. Мордовцева», «Мордовцева, 8»), with the city and the
   region not counting and kind words («батарея», «остров») needed only when the name has nothing
   else. Merely nearby is not enough; none is better than a wrong one. Each photo row of the
   snapshot records how it was found (`tie`), its description and categories; a row of an older
   snapshot without `tie` must name the object. Photos and texts go only to public places with a
   name of their own — never to an archived, hidden or held place, nor to one named after its
   category. Photos are attached
   only where a place or area has no photos at all (user photos always come first), hot-linked
   through Commons thumbnails, each with `credit = {author, license, source_url}` shown on the
   photo. A Wikipedia paragraph fills only an empty description and is shown with «Текст:
   Википедия, CC BY-SA 4.0» and a link to the article (`description_credit`).
   **Applying:** the seed applies the committed snapshot to a fresh database; an existing database
   receives each new version of the file once, at the first start-up after it is committed
   (`applied_snapshots` remembers the version — a removed archive photo is not brought back on the
   next restart). Database only, no request to Wikimedia, well under a second. The CLI without
   `--fetch` applies it again on demand.
   **Status (2026-11-13):** on 2026-11-11 Wikimedia answered with HTTP 403 «Please respect our
   robot policy» (https://w.wiki/4wJS); on 2026-11-13 Commons refused with 429 after 7 requests
   (by design a refused run writes no snapshot). A later run the same day succeeded (552 targets,
   167 requests) but predates the rule above: its rows carry no `tie`, so applied as it is only the
   photos whose titles name their objects survive; a new run records the ties. The User-Agent policy asks for contact information in the User-Agent; since
   2026-11-13 ours carries the address of the site (`https://mayak.ofdm.tech`, the owner's decision;
   still no personal data). Nothing tries to get around a refusal.
2. **Aggregate rating from 2GIS** (official Places API, allowed with attribution; verified on
   our key: `fields=items.reviews` → `general_rating`, `general_review_count`) for places and
   areas linked to a 2GIS object (`object_id`). Shown as a separate reference line
   «2ГИС: 4.9 · 3 867 отзывов» with a link — never blended into our own `rating_avg` (nor into
   the separate blended rating of §22, which reads only the §20 cache). Fetched
   lazily on card open, cached 7 days, hard daily cap (Places quota is 1 000 requests/month).
3. **Deep links** «Отзывы в 2ГИС / Яндекс Картах / Google Maps» from the place and area card
   (by name + coordinates). No data is copied; the user reads reviews where they live.
4. Our own reviews, notes and verification votes remain the content that is unique to the platform.

## 20. Reviews from external catalogues (feature flag)

The product owner wanted to test the theory that showing reviews and photos from the big map
services next to our own content is valuable. §19 explains why this cannot be a permanent
feature without the source's permission; this section began as a **contained experiment** that
can be deleted in one commit.

**Status (2026-11-12):** the owner decided the product is an aggregator — reviews, photos and
ratings from Yandex Maps, 2GIS and Google Maps are a core feature. The package stays where it is;
core code depends on it through one explicit interface (`ratings`, the cached sources' ratings
for §22). The legal position of §19 is unchanged and remains the owner's decision.

Feasibility check (2026-11-11, plain HTTPS requests, no browser automation):

| Source | Result |
|---|---|
| Yandex Maps | Works. `https://yandex.ru/maps/org/<org_id>/reviews/` embeds a JSON state (`<script type="application/json" class="state-view">`) with `reviewResults.reviews` (50 items: rating, text, updatedTime, photos) and the search page gives `ratingData` (rating, counts), the org id and photo URL templates. |
| 2GIS | Works through the anonymous web API. Public configuration comes from `https://2gis.ru/`; catalogue requests carry the web client's `r` checksum. `/2.0/branches/{id}/reviews` returns JSON review texts without a browser or a paid review key. The project's Places key returns 403 here and is not used. Organisations (`branch`) are searched first; when none is ours, map objects — bridges, squares, embankments, hills (`building`, `adm_div`, `attraction`) — are searched, and their reviews are read from `/3.0/geo/{id}/reviews` (verified 2026-11-12 against the web client's own request). |
| Google Maps | Verified 2026-11-12: anonymous search (`q` + `pb`) and `qv9Egd` form POST return a five-review preview for Primorsky Oceanarium through the proxy. Own anonymous response cookies only, no API key/browser. Old `listentitiesreviews` returns 404. |

The 2GIS and Google providers use the same API and frontend block as Yandex. Initial transport
verification returned 10 Yandex, 10 2GIS and 5 Google reviews for Primorsky Oceanarium. This
established transport feasibility, not correct identity resolution. The matching policy below
supersedes the initial fuzzy/nearest matching: the saved longer Google name is accepted as our
name extended, while 2GIS's separate exposition/dolphinarium entries compete with each other and
match nothing. An explicit 2GIS object binding can still identify the intended building.
Published 2GIS web keys are rediscovered from the homepage and cached in memory for 24 hours.

Rules of the experiment:

- One module (`services/experimental/external_reviews/`), one router, the existing Yandex table pair
  (`external_review_sources`, `external_reviews`) and an additional provider table pair
  (`external_catalogue_sources`, `external_catalogue_reviews`) with its paging cursors
  (`external_catalogue_cursors`), the match-evidence table, one frontend folder
  (`features/places/external/`); setting `EXTERNAL_REVIEWS_ENABLED` (default **false**; on for the
  demo stand). Core code depends on it only through `ratings` (§22).
- Eligible: every area; `tourism` and `infrastructure` places with a real name (not the category
  name, not a title generated for an unnamed OSM object such as «Детская площадка»).
- Matching (pure, `matcher.py`, policy `extended-names-v2`): without an explicit provider
  binding, require a distinctive name and a pin close enough. The name is either **exact** after
  case/ё/punctuation/word-order normalization, or **ours extended**: every word of ours,
  unstemmed, before the first comma, with no other kind word there and no business or department
  word anywhere («Приморский океанариум, экспозиционный корпус» and «Мемориальная подводная
  лодка С-56, музей» extend; «…, касса», «Кафе …», «Бизнес-зал, …» do not). Close enough is
  **50 m** for a place; for an area — its radius + 300 m for the exact name and its radius for
  an extended one; 1500 m for the exact name of a bridge, embankment or street. No generic-kind
  fallback.
  Only the top 5 may establish a match, but all returned results are checked for ambiguity
  (2GIS requests 20). A different nearby ID with the same or a similar name vetoes the match;
  the ambiguity radius is at least 400 m, expanded for long objects/areas. Neither source rank
  nor distance breaks a tie. A cashier, department, or parent location is not the whole place.
  An explicit 2GIS `object_id` identifies only that ID, with a geographic sanity check (400 m,
  1.5 km for long objects, area radius + 300 m). No confident match → no reviews, rating or photos
  from that provider; only navigation links remain. A normal refusal is cached as `no_match`,
  not treated as a provider failure. The app has no structured address/phone/site fields to
  corroborate identity; the narrow rules deliberately accept false negatives. Regression
  scenarios are not a measured guarantee of real-world matching accuracy.
- **Identity judge (LLM):** where these rules abstain and the source returned entries, an LLM
  through OpenRouter decides which entry is the same real-world object, or none
  (`EXTERNAL_REVIEWS_LLM_MODEL`, default `typesafe/jev-router`; `EXTERNAL_REVIEWS_LLM_ENABLED`, on
  when `OPENROUTER_API_KEY` is set; without a key the behaviour is exactly the rules above). It is
  shown our object (title, place or area with its radius, category or area kind, parent area) and
  at most 20 entries within the sanity bound of an explicit ID (400 m, 1.5 km for long objects,
  area radius + 300 m; never kilometres away), each ID once — title, catalogue type when known
  (2GIS `branch`, `building`, `adm_div`, `attraction`), distance, review count. Nothing about any
  person is sent. Its rules: the same object, not a similar name; departments, ticket offices,
  business lounges, shops, cafés, hotels that merely carry the name are not the object; the parent
  territory is not a place inside it; a territory is matched by a territory or map object, never by
  a business named after it; of several entries of one organisation, the main one (usually far
  more reviews); word order, case and «им.» variations are the same name; unsure → none. The
  answer is strict JSON (`candidate` number or null, `reason`), temperature 0, ≤ 200 tokens, one
  retry on a transport error, 30 s hard limit; anything else is no answer. The pick must still
  lie within the bound and must not be our place's parent area under its very name. 2GIS shows the
  judge its organisations and map objects together, so the quarter «Миллионка» (`adm_div`) wins
  over the restaurant «Миллионка». Verified 2026-11-12 on ten hand-built misses of the rules: all
  ten answered correctly (including «none» for Миллионка's businesses alone), 2–9 s each.
- `external_review_match_evidence` records the source ID/name/coordinates, matching method
  (`exact_name_nearby`, `extended_name_nearby`, `explicit_id`, `llm_choice`; for no match
  `unconfirmed` — rules alone, `llm_none` — the judge settled on none, `explicit_id_rejected`),
  source fetch timestamp, and a fingerprint of policy version + target inputs (the category/kind
  given to the judge is context, not identity, and is not part of it). The policy stays
  `extended-names-v2` with the judge: it runs only where the rules abstain, so their matches stay
  valid; while a judge is configured, an `unconfirmed` "no match" (an older answer of the rules
  alone, or a judgement that failed) is asked again after an hour like a failed lookup. Source and
  evidence commit together. Old caches without evidence, or a renamed/moved/reparented/rebound
  target, are hidden immediately, including `cached_only`/photo fallback. Rechecks preserve
  the existing request budget. Warm-up uses the same validity rules. Frontend cache keys also
  include the policy version and target identity, so edits cannot reuse a previous result.
- Strictly on demand (a card's reviews tab, an area card's block, «Показать ещё»), then cached 7
  days. The card's summary row and photo fallback read the cache only (`cached_only=true`); lists
  never ask a source (they read cached ratings for §22 and the borrowed covers of §25).
  A warm-up CLI prepares a demo database: `uv run python -m
  app.services.experimental.external_reviews.warmup [--source all|yandex|2gis|google] [--limit 40]` looks up the most notable
  eligible objects without a cached answer (areas by interest and community tourism places by
  trust, in turns), one after another through the same service, limits and judge, and stops at the
  first refused lookup — asking a refusing source object after object is pointless — or when the
  daily cap is reached. ≤ 1 request per 4 seconds (also kept against the last stored request of
  another process); daily cap `EXTERNAL_REVIEWS_DAILY_REQUEST_CAP` requests per source and rolling
  day (default 10 000), lookups and further pages together.
- **Transport update (2026-11-11):** the owner supplied a SOCKS5H proxy; it is configured through
  `EXTERNAL_REVIEWS_PROXY_URL`, with an optional random `{sid}` per client instance. Only HTTP/API
  loading is in scope; Chromium/Playwright was explicitly declined. No captcha solving or
  header/fingerprint games. A transport failure (the proxy refused, a connect timeout, a dropped
  connection) is retried once, after the usual spacing, through a fresh proxy session (`{sid}`
  re-rolled). If the source answers with a captcha, a redirect or an error status, that one lookup
  ends as `blocked` — never retried, no new session, no other reaction; an answer that cannot be
  read (changed layout, stub, a second transport failure) ends it as `failed`. Neither is an
  answer: that target is asked again after an hour, other targets as usual. A provider is never
  switched off as a whole (owner's decision 2026-11-12); the only global limits are the daily cap
  and the spacing.
  For debugging, `EXTERNAL_REVIEWS_FAILURE_DUMP_DIR` keeps the unread answer; raw pages carry
  reviewer names, so it stays unset otherwise.
- The common block includes Yandex, 2GIS and Google texts with separate aggregate ratings, and navigation
  links to all three catalogues. Fresh cached official 2GIS ratings remain a fallback only with
  current matching evidence for the same target and object ID. Google contributes the available preview, not a full history, and its unverified
  exact publication dates are `null`. A slow provider returns
  `pending=true` and its name in `pending_sources` so the frontend can wait without starting a
  duplicate fetch. Limits apply separately to each provider. `EXTERNAL_REVIEWS_TWOGIS_ENABLED` and
  `EXTERNAL_REVIEWS_GOOGLE_ENABLED` (default true) control these providers independently inside the globally disabled-by-default experiment.
- Up to 30 reviews per source come with the lookup's own request (2GIS `limit=30` on both review
  addresses, what Yandex's reviews page embeds up to 30, Google's anonymous preview of five).
  **«Показать ещё»** loads one further page on request: one request under the same lock, spacing
  and cap, counted in the stored budget (on the cursor, so the match's age is unchanged); the
  reviews are appended to the cached match, de-duplicated against what is stored, at most 200
  per source. Only 2GIS map objects page (`/3.0/geo/{id}/reviews`, our own `offset` and `limit=50`
  on the fixed host, never the answer's `next_link`); the organisations' address has no verified
  paging parameter, Yandex's next pages need a signed request and Google's feed is a preview, so
  those say `has_more` false. A refused or unreadable page changes nothing stored (answer 502).
- Data minimisation: stored — rating, text truncated to 600 characters, date, link to the
  original page; **never** the reviewer's name, avatar or profile (personal data). Photos are
  not stored, only hot-linked URLs are returned — of Yandex, what the search page the lookup reads
  anyway embeds for the organisation, up to 30 (the parser kept 8 before 2026-11-13; stored
  answers grow at their next lookup). 2GIS (verified 2026-11-13): the main photo of the object's
  own album, from the catalogue answer the lookup reads anyway when it asks for
  `items.external_content` too (the project's paid Places key does not return that field), then
  the photos visitors attached to the reviews the lookup reads (`preview_urls`, 1920 px); a search
  answer leaves the album out for some map objects, so a match left without any photo asks the
  object for its album — one request more, at most, inside the lookup's budget (5), and a refusal
  there costs nothing but that photo. Google: the place's main photo from the search answer and
  the photos attached to the previewed reviews, asked of the image host at 1280 px; never a
  reviewer's avatar. Both up to 30, hot-linked, never stored as files.
- Presentation: a compact summary row under the card title («Яндекс Карты ★ 4,9 · 534 отзыва»,
  tap → the full block); the full, clearly separated block «Отзывы в других сервисах» under our own
  reviews (and in the area card) with the source's aggregate rating, a link «читать на Яндекс
  Картах», and the note «сторонние отзывы, не проверены жителями»; when a card has no photos of
  its own, the source's photos are shown hot-linked as a gallery / cover fallback with «Фото:
  Яндекс Карты» — never stored as `Photo` rows; after a card's own photos they follow in the same
  gallery, each with that mark. An object with no cover at all borrows the first of them as its
  cover in lists and cards (§25). Never blended into `rating_avg`, trust or interest; the
  separate blended figure is §22.
- HTML/JSON from the source is untrusted input: parsed defensively, rendered as plain text.
- Exit criteria: if the feature is not continued, remove it in one commit — backend: the package
  `app/services/experimental/external_reviews/`, its `include_router` line and import in
  `app/api/v1/__init__.py`, `app/services/combined_ratings.py` with its router dependency there,
  `app/domain/combined_rating.py`, the `combined_rating` fields of the place and area schemas,
  the borrowed covers (`borrowed_for_*` in `app/services/covers.py` and their callers, the
  catalogue part of `app/domain/cover.py`, the `cover_source` fields),
  the setting `external_reviews_enabled` (`app/core/config.py`, both
  `.env.example`), `tests/experimental/`, `tests/fixtures/yandex/`, `tests/fixtures/google/`, the section in `docs/API.md`;
  drop the tables `external_review_sources`, `external_reviews`, `external_catalogue_sources`,
  `external_catalogue_reviews`, `external_catalogue_cursors`, `external_review_match_evidence`. Frontend: the folder
  `features/places/external/`, its four export lines in `features/places/index.ts`, and the mounts
  in `card/PlacePanel.tsx`, `card/PlaceGallery.tsx`, `card/ReviewsTab.tsx`, `areas/card/AreaBody.tsx`,
  `areas/card/AreaCover.tsx`. If it is continued, obtain the source's permission or switch to an
  official API.

## 21. External source: Wikivoyage («Викигид») — described sights and local places

The Russian travel guide has what the map lacked most: sights and local places with a few lines
written by someone who went there. Its articles «Владивосток» and «Остров Русский» (the only
district article with listings) hold ~100 `{{listing}}` templates, 75 with coordinates, many with
a Wikidata id and a Commons image. Text licence CC BY-SA 4.0.

- **How it is loaded**: at development time the two articles are requested once each through the
  MediaWiki API (`action=parse&prop=wikitext`, fixed User-Agent, ≤ 1 request/second) and parsed by
  a pure function into a normalised snapshot `app/seed/wikivoyage_snapshot.json` (sidecar
  `wikivoyage_snapshot.txt`: licence and attribution) that the seed imports offline. Refresh and
  apply: `uv run python -m app.wikivoyage_import [--fetch]` — idempotent, safe on a running
  database.
- **Parser** (untrusted wikitext): comments removed first (commented-out listings do not exist);
  templates matched by counting braces, parameters split at top-level pipes only; `{{listing}}`
  and `{{see|do|eat|drink|buy|sleep|go}}`; one-line and multi-line forms; the typos `la=` / `lon=`;
  values reduced to plain text — references, files, links (`[[a|b]]` → b), external links,
  emphasis and unknown templates dropped, entities decoded, `{{hours|Пн|Пт|10||22}}` rendered as
  «Пн–Пт 10:00–22:00». Listing id: the Wikidata id, else a stable hash of article and name.
- **Mapping** (pure, `normaliser.py`): `see` → tourism by keywords of the name (museum/theatre →
  `culture_space`, «смотровая» → `viewpoint`, monuments/fortress/batteries/lighthouse →
  `historic`, churches/bridges/stations/squares → `architecture`, bays/islands/capes/hills/parks →
  `nature`, a description promising a view → `viewpoint`, else `unusual`); `do` → `culture_space`
  for museums and theatres (name or description), `nature`, else `unusual`; `eat`/`drink` →
  `food`; `sleep`, `go`, `buy` are not shown. Opening hours → the `hours` attribute.
- **Who becomes a place**: a listing with coordinates inside `OSM_BBOX`, a description of at least
  80 characters, no «закрыт» / «на реконструкции» in it, a point not shared with a differently
  named listing (the guide puts «Русский мост» at the university) and not already described by an
  earlier listing within 1 km. Every other located listing may only enrich.
- **Merge instead of duplicate**: a listing describes an existing place when a public tourism
  place has its very name (or its alternative name) within 500 m, or a similar name of a
  compatible category within 80 m (groups: sights — historic/architecture/unusual; nature —
  nature/viewpoint; culture spaces; food — a museum never merges into the monument next door);
  it describes an area when the area has a similar name and the listing lies inside it or within
  its radius + 150 m. Then it fills what is missing there — the description if it is empty or was
  generated by the OSM import (untouched by moderators), never resident text; opening hours and
  the address if absent — and is recorded in `external_links` (`wikivoyage:<listing>` → place /
  area) so that the photo job (§19) finds its image and Wikidata photos.
- **Identity and trust**: `external = {source: "wikivoyage", label: «Викигид», url: <article>}`,
  `external_id = wikivoyage:<listing>`, system author «Викигид». Source weight 2.0 — between OSM
  (1.0) and VL.ru (4.0): one first-hand but undated account → `preliminary`; the card says «Место из
  путеводителя Викигид — его описали путешественники, а не жители» and «Ждёт подтверждения
  жителей» until a resident confirms it. Re-import updates untouched guide places, keeps moderator
  edits, never brings back hidden or archived ones.
- **Credit**: every text from the guide is shown with «Текст: Викигид, CC BY-SA 4.0» and a link
  (`description_credit`, `text_credits` table); photos keep their own Commons credit.

## 22. Combined rating — our rating blended with the catalogues'

Cards show one figure that also reflects what Yandex Maps, 2GIS and Google Maps say, next to (not
instead of) our own `rating_avg`. `combined_rating` on the place list item, the place card, the
area list item and the area card:

- **Data**: only what the §20 cache already holds — matched, non-expired rows whose match evidence
  is current for the target's fingerprint (the same condition as `cached_for`). Reading it never
  triggers a lookup, so it is safe for lists; a page of places or areas is loaded in a fixed number
  of queries, without review texts. The official 2GIS Places rating of §19 is not used.
- **Parts**: ours — a place's `rating_avg` with `rating_count`; an area's `rating_avg` (the mean of
  the places inside) with the number of ratings behind it (the sum of `rating_count` of the public
  infrastructure and tourism places it averages) — and each source's rating with its count of
  ratings (Yandex `ratings_count`, otherwise the reviews count; unknown → null).
- **Formula**: each part's weight is `log10(1 + count)`, 1.0 when the count is unknown; our own
  part's weight is doubled; `value = Σ(rating · weight) / Σ weight`, kept within 1..5 and rounded to
  0.1. A part with zero ratings weighs nothing. `count` is ours plus the sources' counts where
  known. `parts` lists ours first, then Yandex, 2GIS, Google.
- **Null** when no source with a rating is known for the object (the UI then shows `rating_avg` as
  before) or while the external reviews are disabled (`EXTERNAL_REVIEWS_ENABLED=false`).
- **Untouched**: `rating_avg`, `trust_score`, `interest`, sorting and filters never use the blend.
  Example: one resident's 3 and Yandex's 5.0 from 37 615 ratings give
  (3 · 2·log10 2 + 5 · log10 37 616) / (2·log10 2 + log10 37 616) ≈ 4.8 from 37 616 ratings.

## 23. Interests — personal relevance and recommendations

What is interesting depends on who looks. A sea-lover and a history buff open the same map and
should first see different things; a well-known embankment stays interesting for both. Three
parts: every object carries **topics**, every person has an **interest profile**, and the two give
a **match** that drives the personal interest of locations and the «Для вас» recommendations on
the map and in the afisha.

### 23.1 Topics

A fixed catalogue (code-level, `GET /interests/topics`, order as listed):

| slug | label | what it covers |
|---|---|---|
| `sea` | Море и берег | набережные, пляжи, бухты, маяки, острова, яхты |
| `views` | Виды и панорамы | смотровые, сопки, закаты, мосты |
| `history` | История | форты, батареи, памятники, старый город |
| `architecture` | Архитектура | здания, кварталы, мосты как сооружения |
| `nature` | Природа и тропы | парки, леса, тропы, ботаника |
| `art` | Искусство и культура | музеи, театры, галереи, выставки |
| `music` | Музыка | концерты, фестивали, джаз, клубные вечера |
| `food` | Еда и кофе | кафе, рынки, гастрономия |
| `sport` | Спорт и движение | площадки, пробежки, игры, йога |
| `family` | С детьми | детские площадки, мастер-классы и спектакли для детей |
| `learning` | Лекции и мастерские | лекции, мастер-классы, библиотеки, экскурсии |
| `fun` | Развлечения | шоу, квизы, вечеринки, аттракционы |
| `unusual` | Необычное | нишевые, странные, «для своих» места |

### 23.2 Topics of an object

Places (all layers except `issue`), events and areas get topic tags with a weight 0..1:

- **Rules** (free, immediate, always on): the category (`historic` → history, `viewpoint` → views,
  `playground` → family, event `education` → learning …), the area kind (`beach`, `embankment`,
  `island` → sea …), and a keyword lexicon over title, tags and description («маяк», «бухта»,
  «форт», «джаз», «для детей» …). Category/kind tags weigh 0.8, keyword tags 0.6.
- **LLM** (`typesafe/jev-router` via OpenRouter, the same key as §14): for objects with something
  to read — tourism places, areas, events — the model is given title, category, description and
  tags of a batch of objects and returns for each up to four topics from the catalogue with a
  weight. It can find what the rules cannot: a niche courtyard with a history, a lecture that is
  really about the sea. Its answer is untrusted data: slugs outside the catalogue are dropped,
  weights are clamped, a broken answer is no answer. LLM tags replace keyword tags of the same
  object and are merged with category tags (the maximum weight wins).
- **Areas** additionally inherit from what is inside: a topic carried by the public places of the
  area with share `s` of them adds weight `min(0.8, 0.3 + s)`.
- Stored in `interest_tags` (`target_type` place · area, `target_id`, `topic`, `weight`, `method`
  rule · llm, `basis` category · keyword · inside · llm — an object's weight of a topic is the
  maximum over its bases) with `interest_tag_states` (the fingerprint of the text that was
  classified, by which method, the rules version, and how many LLM requests carried the object
  without an answer — after three the rules alone carry it), so an edited object is classified
  again and an unchanged one never twice. Inherited tags are refreshed when a place inside is
  created or edited and at start-up. Topics shown as "what it is about" need weight ≥ 0.3.
- **When**: rule tags — on create / edit / import, and for everything unclassified at start-up.
  LLM — a background loop after start-up while there are objects whose state is not `llm` (batches
  of 15, one request every few seconds, a daily cap of requests), and
  `python -m app.services.interests.classify`. Without a key, or with
  `INTERESTS_LLM_ENABLED=false`, the rules alone carry the feature. The daily cap is counted per
  UTC day in memory, by the server and by each run of the command separately.
- Objects with no topic at all simply never match — they are not penalised below.

### 23.3 Interest profile

- **Chosen topics**: picked on a screen shown right after registration («Что вам интересно?»,
  tiles as in music and pin services, three or more recommended, can be skipped) and editable in
  the profile settings. A visitor without an account may pick topics too: they live in the browser
  and are sent as the `topics` parameter; on registration or login they are saved to the account
  when it has none.
- **Learned affinity**, per topic, from what the person does with objects carrying that topic
  (weighted by the object's topic weight):

  | signal | change |
  |---|---|
  | added to favourites / saved a route stop's place to a collection | +1.0 (removed: −1.0) |
  | review with rating 5 · 4 · 3 · 2 · 1 | +1.0 · +0.6 · 0 · −0.4 · −0.6 |
  | «Я пойду» on an event | +0.8 (cancelled participation: −0.8) |
  | a search (≥ 3 characters, reported by the client once the query settles) | +0.3 per topic the lexicon finds in the query, at most once per topic per day |

  Only the resulting numbers are stored (`user_interests`: `chosen`, `affinity`); the text of a
  search is never kept. Affinity is kept within −3..+6.
- **Weight of a topic for a person**: `u = clamp(0.6·chosen + 0.4·tanh(affinity / 3), 0, 1)` — an
  explicit choice is worth more than behaviour, behaviour alone can still bring a topic to 0.4,
  and disliking things lowers it but never below zero.
- The person can see their chosen topics and the topics «мы заметили» (learned `u ≥ 0.15`
  without a choice) and reset the learned part. Weights and formulas are not shown.

### 23.4 Match and personal interest

- `match(object, person) = 1 − Π_t (1 − u_t · w_t)` over the object's topics (0 when the person
  has no profile or the object no topics). The **reason** is the one or two topics with the
  largest `u_t · w_t` — shown as chips («История», «Море и берег»).
- **Personal interest of an area** — the §17 `interest` moved towards the person, mostly up:

  ```
  unfit    = max(0, 1 − match / 0.25)
  personal = interest + match · 0.5 · (100 − interest) − unfit · 0.1 · interest
  ```

  rounded, 0..100; equal to `interest` for a person without a profile. A top location loses at
  most a tenth («Спортивная набережная» 80 → 72 for someone who only likes lectures) and a modest
  one that fits can double (40 → 70). From `match ≥ 0.25` the location **fits**: nothing is taken
  off — a location that suits the person is never shown lower than it is for everyone, however
  high its interest already is — and only then are the reason chips given (`topics` is empty
  below that). `interest` itself, trust, ratings and their sorting are never changed by
  personalisation. The area card shows the personal value with «для вас», the reason chips and
  the general level; the list marks «для вас» only where there are reasons.

### 23.5 Recommendations — «Для вас»

`GET /recommendations` returns what to show first, for the map (`scope=map`: areas and tourism
places in the visible box) or the afisha (`scope=events`: upcoming events, optionally within a
period):

```
quality = interest / 100 for an area;
          0.5·trust_score/100 + 0.5·(rating − 1)/4 for a place (trust alone when unrated);
          1.0 for an event of a trusted source or a verified one, 0.7 otherwise
score   = match · (0.6 + 0.4 · quality)
```

- Quality only nudges: a little-known courtyard with a history beats a famous square for a
  history lover — niche objects are the point. Candidates must be public (`unverified` …
  `verified`; never `needs_review`, `hidden`, `pending`), not the person's own, not already in
  their favourites; events must not be finished, cancelled, full or already joined.
- Order by `score` (equal events: the sooner first); at most three results share the same
  leading topic, so the top of the list is not one theme; when that leaves room (a person with
  one or two interests), the passed-over results follow in score order. `match < 0.15` is not
  recommended at all.
- One result per title: a recurring event appears once (its nearest date), a museum mapped twice
  once, and a place named exactly like a recommended location gives way to the location.
- **Discoveries**: every third result is the best-matching place nobody has rated yet — the
  quality term pulls the well-known to the top, and this is how a niche object that fits is seen
  at all. Equally matching discoveries take turns from day to day; they obey the same cap per
  leading topic. Areas and events are never discoveries.
- Without a profile the answer is `personalized: false` with no items — the UI then offers to
  pick interests instead of pretending.
- **Map**: the recommended objects lead the one list of the explore panel (up to five, each row
  marked «для вас», no repeats further down), are drawn on the map with a distinct accent and stay
  visible when zoomed out, even when they are small places normally folded into an area.
  **Afisha**: a «Для вас» strip above the day list.
- **Places at one point** (a venue with several events): one count bubble instead of pins hiding
  each other; a tap opens their list (`?stack=<lat>,<lng>`). The selected or recommended place of
  such a point is drawn as a pin with the rest under it as «+N»; a pin drawn on its own is never
  counted by a cluster.

### 23.6 Limits and privacy

- New tables only (`interest_tags`, `interest_tag_states`, `user_interests`,
  `user_interest_settings`); nothing is added to existing ones.
- The profile is private: never part of `UserProfile`, never visible to other users or moderators.
- The LLM sees only object texts (titles, categories, descriptions, tags) — nothing about any
  person; user content inside them is untrusted data for it.
- Settings: `INTERESTS_LLM_ENABLED` (empty = on when the key is set), `INTERESTS_LLM_MODEL`
  (default `typesafe/jev-router`), `INTERESTS_LLM_DAILY_REQUEST_CAP` (default 2000).

## 24. Screening before anyone sees it — holds, usefulness, author standing, masking

Supersedes the parts of §6 and §14 it contradicts (profanity as a blocking flag; «publishing is
never held by the LLM»). The principle of §14 stays: the model never makes a final decision — it
can only keep content out of public view until a moderator looks. What changes is that it does so
**before** anyone else sees the content. The author is told when their content did not pass.

### 24.1 Screening window and hold

Nobody but the author and moderators gets a screened or held item from any endpoint: lists, the
map, cards, covers, counters, areas, recommendations, search, feeds, statistics.

- **Screening window** (`screening`, normally a few seconds): seamless — the author sees the item
  as published (same status, counters, place in their lists), nobody else sees it.
- **Hold** (`held`, the window failed): the author sees the truth and is told why.
  - A place or route is `pending` for its author too — in cards, lists and counters, exactly like
    a publication waiting for pre-moderation. Its card carries `screening_hold.reasons` (author
    and moderators only) and says that the publication did not pass the automatic check, the
    reasons, that a moderator will decide, that for now only the author sees it and that editing
    is possible (the moderator sees the new version). A held place gets a history entry
    «Публикация отправлена на проверку автоматическим фильтром» (old status → `pending`).
  - A photo, comment, review or note stays visible to its author and is marked `on_review`
    («На проверке — пока видите только вы»).
  - The author gets one notification (kind `moderation`) per hold, not per re-check:
    «Публикация «…» не прошла автоматическую проверку» (or «Маршрут / Фото к / Комментарий к /
    Отзыв к «…»», «Заметка «…» / на карте»), with the reasons, «Пока её видите только вы —
    модератор посмотрит и решит.» and, for places and routes, «Можно исправить её — модератор
    увидит новую версию.»; it links to the place, route or map spot.
  - **Reasons in two voices.** Moderators read the stored lines with the verdict, the categories,
    the model's confidence and the usefulness («Текст: нарушение (реклама), уверенность 0.90»).
    The author reads only what was found and where: «Текст: реклама», «Фото 2: не про место»,
    «Текст: слишком мало сведений о месте» (low usefulness of a place, no number), «Похоже на
    случайный набор букв: название». Never the confidence, the usefulness number, the model's
    summary or anything about the author's standing: a hold that only the standing caused (doubt
    below 0.6, a check that did not happen) reads as «Нужна ручная проверка модератора».
- Applies to: places, routes, photos (each photo on its own), comments, reviews, notes.
- `quiet_holds` — the name is historical, holds are no longer kept from their authors —
  (`target_type`, `target_id`, `state` screening · held · released · decided (a moderator
  confirmed the hold or asked for changes), `reasons`, `source` heuristic · ai · standing,
  `shown_status`, timestamps). A held item that its author edits is checked again for the
  moderator but stays held until the moderator decides. For places and routes the real status is
  `pending` throughout, so the existing visibility rules do the hiding; `shown_status` is the
  status the item gets back when released, and what the author sees during the window. A held
  review does not count in `rating_avg`; a held photo is never a cover for others.
- **Window → release**: everything a person publishes starts as `screening` — already invisible to
  others — and is released silently when the checks pass, normally within seconds. If the model cannot
  answer in 20 s (or there is no key), the item is released, unless the author's standing is low
  (§24.4) — then it stays held for the moderator. Items stuck in `screening` (restart) are
  re-submitted at start-up and by a periodic sweep.
- **What turns a window into a hold**:
  - a photo the vision check (§24.2) does not call `ok` with confidence ≥ 0.5;
  - text the model calls `violation` (any confidence) or `suspicious` with confidence ≥ 0.6 —
    profanity alone is not a reason (§24.5);
  - usefulness below 15 (§24.3);
  - gibberish found by the heuristic check, immediately and without the model: keyboard mashing
    in the title or text («цукйцук», «фывапр», «asdfgh»), never ordinary words («цукини»,
    «ДВФУ», «Wi-Fi», «пр-т 100-летия Владивостока»).
  A strange **address** is not a reason to hold: when only the address looks mashed (a real name
  with a typed-over tail such as «Каторжная слободацукйцук»), the save is refused with 422 on the
  `address` field and a plain hint («Адрес похож на случайный набор букв — поправьте его или
  оставьте тот, что определился по точке»), and the person fixes it. Mashing is judged on words
  of four letters and more — three-letter runs are real words and abbreviations too («про»,
  «СМИ», «ЛОР») — so a bare «цук» is left to usefulness.
  `suspicious` below 0.6 keeps today's behaviour: visible, `needs_review`, a case for the moderator.
- **Moderation**: every hold opens (or joins) a moderation case — trigger `auto_ai`, `auto_image`
  or `auto_text` — marked as held by the check (`quiet` in the API, a historical name), with the
  model's opinion and, for photos, which photo. Every decision is an ordinary one the author hears
  about: `approve` gives the place or route back the status it would have had (recomputed as
  usual), together with the rest of its event series and its photos; residents of the territory
  hear about a new place once; the hold's standing penalty is returned; the author gets the
  approval notification and a history entry (`pending` → the new status); +4 reputation only when
  the author was waiting for pre-moderation anyway (cold mode). `reject` / `hide` /
  `request_changes` keep their ordinary effects and notifications. Occurrences of an event series
  are screened, held and decided together. Held photos, comments, reviews and notes are listed
  for moderators with two outcomes, release or remove; the author is notified of either
  («Ваш комментарий проверен и опубликован» / «Ваш комментарий удалён модератором», with the
  moderator's reason).
- Imported content and seed data are never held. A moderator's own content is not screened.

### 24.2 Photos are checked one by one

Every photo a person attaches — to a new or edited place, through «Добавить фото» on any place
(imported ones included), to a route stop — gets its own request to the vision model: the image
alone, ≤ 1024 px, with a prompt that asks specifically about nudity and sexual content, genitals,
violence and gore, shocking images, obscene gestures or writing, advertising unrelated to a city
object, documents and other personal data, and about pictures that show no place at all
(`not_a_place`: a selfie or close-up portrait, a meme, a screenshot, a photo of a screen — people
who are part of a visible scene are fine; a picture is never held merely for being plain or
uninformative). Answer: `verdict` ok · suspicious · violation,
`categories`, `confidence`, `summary` — untrusted, validated, stored as an `AiReview` of the
photo. All photos of a submission are checked, not the first three. Freely licensed imported
photos (those with a credit) are skipped. Requests count against the §14 daily limit; when it is
exhausted the fallback of §24.1 applies.

### 24.3 Hidden usefulness of a place

The text review also returns `usefulness` 0..100: is this a real, specific, helpful description of
a city object («Питьевой фонтанчик у входа в парк, работает с мая по октябрь» high; «цук» with no
description near zero). Stored in `place_quality`; never shown to users and not part of any public
schema.

- Below 15 → hold (junk does not reach the map; the author reads «слишком мало сведений о месте»). The margin is deliberate: on the real
  model junk scores 0–10 and a bare but real point («Туалет» with no description) about 25.
- Ordering: where places are cut by `limit`, ties in `trust_score` are broken by usefulness; in
  recommendations (§23.5) a place's quality is multiplied by `0.7 + 0.3 · usefulness / 100` when
  known. Trust, status, ratings and reputation never depend on it.
- Imported places are not rated (unknown = neutral).

### 24.4 Hidden author standing

An internal score 0..100 per person (starts at 50), separate from the public reputation and
levels, which keep working exactly as before: `author_standing` with an audit log of changes.

| event | change |
|---|---|
| a publication or photo passed screening | +1 |
| usefulness ≥ 70 | +1 |
| held by a check | −8 |
| a moderator confirmed the hold (`reject` / `hide` / removal) | −15 |
| a moderator released a hold (the check was wrong) | +8 (returns the −8) |

Effects, all of them about how carefully the next publication is looked at: below 30 — a failed
or unavailable check does not release (the item waits for a moderator) and `suspicious` of any
confidence holds; the standing adds to the risk of the author's moderation cases. It never
changes vote weights, reputation, levels or limits. Visible to moderators in the case page only.

### 24.5 Profanity is masked, not blocked

- Profanity no longer sends a place to `pending` and no longer rejects a comment or review.
- Every user-written text leaves the API masked: a word from the profanity list keeps its first
  and last letter and the rest becomes `*` («х*й», «п****ц»; the same stems as §6, word-start
  matching, so «застрахуйте» is untouched). Stored text is unchanged; search works on the
  original; moderators get the original.
- The model is told that swearing by itself is acceptable and masked on display; insults and
  hatred aimed at people or groups are still `offensive`.

## 25. Covers — the photo that makes the best preview

A cover is shown as a square thumbnail in lists and as a wide strip at the top of a card, so the
first photo is not necessarily the right one. The cover is chosen by plain rules, without any
model:

```
score = 0.4 · shape + 0.2 · size + 0.4 · picture
shape   — 1 for width/height between 1.2 and 1.8 (5:4 … 16:9); a square 0.7; falls to 0.25 for
          a portrait of 0.7 and narrower and to 0.3 for a panorama of 2.8 and wider
size    — the shorter side: 0 at 160 px, 1 from 600 px
picture — sharpness 0.35 · exposure 0.25 · contrast 0.15 · colour 0.15 · photograph 0.10;
          0.5 when the file cannot be measured
```

- **Picture measurements** are taken from a 256 px copy when a photo is uploaded (and once at
  start-up for files uploaded earlier): the spread of a Laplacian (sharpness), mean brightness
  (too dark or burnt out is bad), the spread of brightness (contrast), mean saturation (colour)
  and the share of the picture taken by its two commonest colours — a screenshot, a document or a
  flat poster rather than a photograph. Stored in `photo_metrics`; hot-linked photos (archive
  ones, posters of imported events) have no file with us and are judged by shape and size alone.
- **Residents first** (§19): while a place has a resident's photo at least 320 px on its shorter
  side, archive photos do not compete — the best of the residents' photos is the cover. A
  thumbnail-sized upload is not a cover; then the best of everything is taken. Among equals the
  earlier photo stays.
- **Where**: a place — the best among its photos nobody is holding back (§24.1), else the imported
  image; a location — the best cover among those of its eight best places (by trust and rating),
  else its own archive photo; a route — the best photo among its stops by shape and size, else the
  cover of a linked place. The order of photos in the gallery does not change.
- Photos of the external catalogues (§20) carry no size and keep the catalogue's own order.
- **Borrowed cover** (`cover.catalogue_cover`, `covers.borrowed_for_places / _for_areas`): an
  object left without any cover by the rules above — no resident's, archive or imported photo —
  borrows the first photo of a map service: Yandex, then Google, then 2GIS (Yandex and Google lead
  with the place's main photo; a 2GIS album photo comes before its visitors'). A location takes its
  own entry at a service first, then those of its places, best place first. Read per page from
  the external reviews' cache while that experiment is on, never stored on the object and never
  a request to a source (`external_reviews.photos`, next to `ratings`). The answer it comes from
  must still hold for the object as it is now (§20 evidence for the current fingerprint), but not
  only within the week its reviews are fresh: the photo is hot-linked, and one that no longer
  loads gives way to the placeholder. The API marks it with `cover_source = {source, label, url}`
  (`cover_credit` stays empty); every list and card shows the service's mark on it — «Фото: Яндекс
  Карты» linked to the object's page there, its initial on a thumbnail.
- **Only the object itself:** a place never borrows the photos of the location it lies in —
  the entry matched for that location, or one that names it (`cover.shows_the_parent`: «Нагорный
  парк» for «Смотровая Нагорного парка») — no photo is better than the park's. A place named as
  its location («Покровский парк» inside the park of that name) is that location's own object and
  keeps them. The reverse is fine: a location may show the photos of its places.
- Route covers and collection covers read the stored place covers and do not borrow.

