# Маяк — frontend foundation guide

React 19 · TypeScript (strict) · Vite · Tailwind v4 · TanStack Query v5 · React Router v7 ·
Zustand · react-hook-form + zod · `motion` · lucide-react · 2GIS MapGL.
Mobile-first: every screen is designed for 390×844 and adapted up with `lg:` (≥ 1024 px).

```bash
npm install
cp .env.example .env        # VITE_2GIS_KEY=...
npm run dev                 # http://localhost:5173, proxies /api and /media → http://localhost:8000
BACKEND_URL=http://localhost:9000 npm run dev -- --port 5180   # other backend / port
npm run typecheck && npm run lint && npm run build
```

Contract: `docs/API.md` is mirrored 1:1 in `src/shared/api/types.ts`. Design and rules: `docs/FRONTEND.md`.

## Layout of `src/`

```
app/        App, providers, router, sections.ts (lazy section entry points), shell/ (nav, sheet, panel, overlay)
shared/api  client.ts, types.ts, queryKeys.ts, queryClient.ts, one module per domain, twogis.ts
shared/ui   design system + layouts + motion presets (import from '@/shared/ui')
shared/lib  format.ts (Russian dates/plurals), geo.ts, labels.ts, tones.ts, categoryIcons.ts, cn.ts
shared/hooks useCategories, useIsDesktop, useDebouncedValue, useAddressSuggest, useReverseGeocode, useMapObject, useScrollLock
features/   map, auth, interests, places, areas, explore, notifications  +  stubs: events, routes, saved,
            profile, moderation, stats, outages, spot
```

Rules: a feature imports `@/shared/*` and the public `index.ts` of other features only (ESLint
enforces "no deep feature imports"). Dependency direction: `map` ← `places` ← `areas` ←
`explore` / `spot` (`map` and `places` never import `areas`; the notes preview reaches the area
card through the `renderNotes` slot wired in `app/`). No `any`. Server state lives in TanStack
Query. Components ≤ ~200 lines.

## Adding a section

Every stub is already routed through `React.lazy` in `app/sections.ts` + `app/router.tsx` —
**replace the file contents, keep the default export**:

| File | URL | Kind |
|---|---|---|
| `features/events/EventsPanel.tsx` | `/events` | panel |
| `features/routes/RoutesPanel.tsx`, `RoutePage.tsx`, `RouteBuilder.tsx` | `/routes`, `/routes/:id`, `/routes/new`, `/routes/:id/edit` | panel |
| `features/routes/RoutePrintPage.tsx` | `/routes/:id/print` | standalone (no shell, no map) |
| `features/saved/SavedPanel.tsx`, `CollectionPage.tsx` | `/saved`, `/collections/:id` | panel |
| `features/outages/OutagesPanel.tsx` | `/outages` | panel |
| `features/spot/SpotSheet.tsx` | `/?at=<lat>,<lng>&obj=<2gis id>` | on top of any panel |
| `features/profile/ProfilePage.tsx` | `/users/:id`, `/profile` (auth) | overlay page |
| `features/moderation/ModerationPage.tsx`, `CasePage.tsx` | `/moderation`, `/moderation/:caseId` (mods) | overlay page |
| `features/stats/StatsPage.tsx` | `/stats` | overlay page |

A **panel** renders in the bottom sheet (phones) / left side panel (desktop) with the map
visible; an **overlay page** covers the map. The place card (`?place=<id>`), the place editor
and the spot sheet are pushed on top of the current panel section, which stays mounted.

```tsx
// features/events/EventsPanel.tsx
import { useQuery } from '@tanstack/react-query';
import { useMapPlaces } from '@/features/map';
import { PlaceListItem } from '@/features/places';
import { eventsApi, queryKeys } from '@/shared/api';
import { ErrorState, ListSkeleton, MapTopBar, PanelLayout, StaggerItem } from '@/shared/ui';

export default function EventsPanel() {
  const query = { scope: 'upcoming' as const };
  const events = useQuery({ queryKey: queryKeys.events.list(query), queryFn: () => eventsApi.list(query) });
  useMapPlaces(events.data);                       // markers + clusters; click → ?place=<id>

  return (
    <>
      <MapTopBar extra={<DateChips />}>{/* phone only: search pill over the map */}</MapTopBar>
      <PanelLayout title="Афиша" subtitle="Ближайшие события">
        {events.isPending && <ListSkeleton />}
        {events.isError && <ErrorState error={events.error} onRetry={() => void events.refetch()} />}
        <ul className="flex flex-col gap-2">
          {events.data?.map((place, i) => (
            <StaggerItem key={place.id} index={i}><PlaceListItem place={place} /></StaggerItem>
          ))}
        </ul>
      </PanelLayout>
    </>
  );
}
```

### Layouts and the sheet (`@/shared/ui`)

- `PanelLayout` — `title`, `subtitle`, `onBack`, `actions`, `toolbar`, `footer` (sticky primary
  action in the thumb zone), `flush`. Its header is the sheet's drag handle and is what stays
  visible at the `peek` snap, so put the key fact (count, name) in `title`.
- `PageLayout` — overlay pages: `title`, `subtitle`, `onBack`, `actions`, `toolbar`, `width`.
- `MapTopBar` — phone only: search pill (children) and a chip row (`extra`) floating over the map.
- `usePanelStore` — `snap` (`'peek' | 'half' | 'full'`), `setSnap`, `reveal()` (make the panel
  visible), `showMap()` (drop to peek), `collapsed` (desktop). `useSheetPeek(px)` makes the peek
  taller while mounted. `usePanelSection().covered` — true while a card covers your section.
- The sheet: transform-only spring, velocity snapping, rubber band, content scrolls only at
  `full` (pull down from the scroll top hands the gesture back to the sheet), backdrop at `full`.
  Add `data-sheet-ignore` to an element that must not drag the sheet.
- The global «Добавить» (phone FAB / desktop «Добавить место») shows only while a section offers
  it: `useOfferAddPlace(active)` — the explore map calls it while nothing covers it. Sections
  with their own primary action simply don't call it; the button pops out everywhere else.
- `Modal` / `ConfirmDialog` — bottom sheet on phones, centred card on desktop. `Dropdown` /
  `Popover` — popover on desktop, action sheet on phones. Keep them mounted and toggle `open`.
- `SectionStub` — the shared «раздел в разработке» state.

### Motion (`@/shared/ui`)

`SPRING` (`sheet`, `layout`, `pop`, `soft`), `TWEEN` (`fast`, `base`, `slow`), `EASE_OUT`,
`PRESS_SCALE`, variants `fadeVariants` / `riseVariants` / `popVariants` / `pushVariants`, and
wrappers: `Rise`, `StaggerItem` (list entrance), `Pressable`, `Pop` (replays on `trigger`),
`AnimatedNumber` (count-up / ticking), `SuccessCheck`, `HeartButton`. Animate `transform` /
`opacity` only; `MotionConfig reducedMotion="user"` is set globally. Shared-layout markers use
`layoutId` (see `Tabs`, `SegmentedControl`, the tab bar). Every render of a `layout` /
`layoutId` element makes `motion` measure the page — keep such controls out of components that
re-render with the map viewport (`memo` them, as `TrustFilter` and `EventsFilters` are).

### Graphics tier (`@/shared/ui`)

Two rendering tiers: `full` (everything as designed, the default) and `lite` for weak devices.
The tier is `<html data-graphics="full|lite">` plus `useGraphicsTier()` / `useLiteGraphics()`
(store: `useGraphicsStore`, `shared/ui/graphics.ts`). Style lite differences with the `lite:`
variant (`lite:bg-surface`, `lite:filter-none`); global ones live in `index.css`. Lite keeps the
layout, content, colours and interactions and drops only the expensive parts: no
`backdrop-filter` (translucent surfaces become opaque), a shorter `shadow-float`, no infinite
decorative animations (`pulse-ring`, `beam-pulse`, skeleton shimmer — spinners stay), motion
with `reducedMotion="always"` (transforms snap, opacity still fades) and no stagger in `Rise` /
`StaggerItem`, flat map pins (no drop shadow) and MapGL's `graphicsPreset: 'light'` (init-only:
applies from the next page load).

Choice: «Авто» / «Красивая» / «Быстрая» in the profile settings («Графика»), stored per device
in `localStorage['mayak-graphics']`. «Авто»: ≤ 2 cores or ≤ 2 GB memory → `lite` at once;
otherwise `full`, and `graphicsProbe.ts` samples frame times during interactions (taps, drags,
wheel — idle pages cost nothing) in 90-frame windows: a window is slow when the median frame is
over 28 ms or ≥ 20 % of frames exceed 50 ms. Two slow windows (one with a weak hint: ≤ 4 cores,
≤ 4 GB, «reduce motion») switch to `lite`; three good ones settle on `full`. The verdict is
remembered for 30 days; within a visit the tier only goes `full` → `lite`; picking «Авто» again
re-evaluates. `prefers-reduced-motion` is independent and works in both tiers.

## Map API (`@/features/map`)

One MapGL instance lives in `MapProvider`; never create another. Coordinates in the app are
`{ lat, lng }`; API line geometry is `[lng, lat][]`.

```tsx
// Markers (clustered, selected state, click → ?place=<id>). One section owns the layer at a time.
useMapPlaces(places);                         // PlaceCard[] | undefined (undefined keeps old markers)
useMapPlaces(places, { fold });               // opt-in folding (explore only): fold(place) === true →
                                              //   hidden below PLACE_UNFOLD_ZOOM (15.5), its area pill stands for it
useMapFocusPlace(place);                      // keep one extra place on the map (the open card does it)
useMapExtraPlaces(area.places);               // more places on top of the section's list while mounted
useMapUnfoldArea(areaId);                     // this area's folded places stay visible at any zoom
const folded = useMapFolded();                // camera below PLACE_UNFOLD_ZOOM
const points = useMapMarkerPoints();          // [lng, lat] of the place markers (label collision)
const picking = useMapPicking();              // "pick a point" owns the map — step aside
const { placeId, openPlace, closePlace } = usePlaceParam();
const { areaId, openArea, closeArea } = useAreaParam();   // ?area=<id>; a place opened on top keeps it

// Viewport and camera (panel/sheet-aware: targets land in the visible part of the map)
const viewport = useMapViewport();            // { bounds, center, zoom } | null, debounced
const { flyTo, fitBounds, zoomBy, ready } = useMapActions();
flyTo({ lat, lng }, { minZoom: 15 });
fitBounds(boundsOfPoints(points)!, { maxZoom: 16 });

// Route line: draws progressively, numbered stops, `via` stops are invisible
<MapRoute path={route.path} stops={route.stops.map((s) => ({ key: s.position, ...s }))}
          stopMarkers="number" activeStopKey={active} onStopClick={setActive} fit />

// Territories, circles, dots, custom markers
<MapPolygon geometry={geoPolygon} color="#F97316" fillOpacity={0.14} minZoom={14} />   // Polygon | MultiPolygon
<MapCircle center={{ lat, lng }} radiusM={600} />                 // metres, translucent red
<MapDragHandle position={p} label="Точка 2" onDrag={…} onDragEnd={…} onTap={…} onLongPress={…}>
  <span className="size-4 rounded-full bg-brand" />                // 44 px hit area, map panning off while dragging
</MapDragHandle>
<MapDots dots={[{ id, lat, lng, color }]} minZoom={13.5} onClick={(id) => …} />   // ≤ ~2000, WebGL
<MapHtmlMarker position={{ lat, lng }} anchor={[12, 12]}>…React…</MapHtmlMarker>

// Pick a point (forms): a pin fixed in the centre of the visible map
const { point, moveTo } = usePickPoint(active, initialPoint);

// Geolocation
const { location, status, locate } = useUserLocation();           // locate() asks permission, flies
const here = await resolveUserLocation();                         // silent, never prompts

// Taps on the base map (not on our markers / dots, not in pick mode, not the tap that closed a popover)
useMapTap(({ lat, lng, objectId }) => …);     // objectId = 2GIS object under the tap
useMapObjectHighlight(objectId);              // map.setSelectedObjects while mounted
<MapTapPin position={{ lat, lng }} />
const { spot, openSpot, closeSpot } = useSpotParam();   // ?at=<lat>,<lng>&obj=<id> (already wired to taps)
```

`useMap()` gives the raw `{ map, api, status }` if you really need MapGL. No routing API is ever
called from the frontend — the backend builds route lines on OpenStreetMap data; use
`routesApi.preview` (debounce ≥ 800 ms, `staleTime: Infinity`, key `queryKeys.routes.preview(input)`).

2GIS Catalog (quota: ~1000 requests/month) — only through the cached hooks in `@/shared/hooks`:
`useAddressSuggest(text, near)` (≥ 3 chars, 600 ms debounce), `useReverseGeocode(point | null,
level?)` (once per confirmed point; `'area'` → «Светланская улица, Ленинский район», never an
organisation), `useMapObject(objectId)` (name/address of a tapped object). All
return empty results on failure.

## Auth (`@/features/auth`)

```tsx
const { user, isAuthenticated, isModerator, permissions, logout } = useAuth();   // polls /auth/me every 60 s
requireAuth(() => join.mutate(), 'чтобы записаться на событие');   // anonymous → modal → resumes the action
openAuthModal('register');
<RequireAuth moderator>…</RequireAuth>                              // route guard with a sign-in prompt
```

## Interests (`@/features/interests`, SPEC §23)

Topics (13 slugs: icon + tone in `topics.ts`, labels from `GET /interests/topics` over the built-in
Russian ones), the interest profile and «Для вас». It imports `auth` only; `places`, `areas`,
`explore`, `events` and `profile` use it. Mechanics are never shown — no weights, scores or
affinity, only topic chips and «для вас».

```tsx
const { key, topics, ready } = usePersonalization();   // put `key` into query keys of personal data;
                                                        // `topics` = csv for visitors, undefined for an
                                                        // account with a profile; hold requests until `ready`
useRecommendations({ scope: 'map', bbox }, { enabled });   // GET /recommendations, keeps the previous answer
<ForYouStrip recommendations={data} itemKey={…} renderCard={(item) => <ForYouCard … />} />
                                                        // personalized: false → «Выберите интересы» invitation
                                                        // (dismissible), no items → nothing
<TopicChips topics={place.topics} />                    // subtle, ≤ 4; variant="reason" for «почему для вас»
openInterestsPicker('invite' | 'settings');             // the shared «Что вам интересно?» dialog
useSearchSignal(searchText);                            // settled search (≥ 3 chars, once per text) of a
                                                        // signed-in person → POST /me/interests/signals
<InterestsSettings />                                   // «Мои интересы» in the profile settings
```

- A visitor's topics live in this browser (`mayak-interests`); after a sign-in an account that has
  never answered the picker takes them over. Registration ends with the picker step:
  `<AuthModal renderOnboarding={(done) => <InterestsOnboarding onDone={done} />} />` (wired in
  `app/`), and `requireAuth`'s pending action resumes after it.
- `InterestsHost` (app shell) hosts the picker dialog, does that sync and refetches open area
  cards when the profile changes; area lists and recommendations carry the profile key.
- Map: `useMapRecommended(places)` / `useMapRecommendedAreas(areas)` — drawn even when the list
  lacks them, never folded or clustered away, with a navy-and-beam sparkle accent; recommended
  area pills go first in the label layout.
- Areas: `personal_interest.value` replaces the shown tier and meter with a «для вас» mark and the
  reason chips; the general tier stays in the card («В целом: …») and the list tooltip. Lists
  stay sorted by the general `interest`.
- An older backend (no topics endpoint, no new fields) simply shows today's UI.

## Places (`@/features/places`)

```tsx
<PlaceListItem place={card} distanceM={120} trailing={<IconButton … />} onSelect={…} />  // default: opens the card
openCreatePlace({ layer: 'event', point: { lat, lng }, address, venuePlaceId, venueTitle, isMeetup: true });
openEditPlace(placeId);
<OutagesChip variant="chip" | "row" />        // «Отключения: N адресов» → /outages, hidden when zero
<PlaceListItem place={card} hideArea />       // inside an area's own list: no «Нагорный парк» caption
openCreatePlace({ areaId, pointHint: { lat, lng } });   // «Добавить место сюда»: area preselected,
                                                        // the point picker starts at pointHint
<ComplaintDialog open onClose={…} targetType="route" targetId={id} />   // place | route («непроходим»)
<ElsewhereLinks title point twoGisUrl={place.external_rating?.url} />  // «Отзывы в 2ГИС · Яндекс Картах · Google Maps»
<RatingSummary item={place} target={externalTarget('place', place)} ownLabel="оценка жителей" />
<ReviewFeed target={externalTarget('area', area)} title="Отзывы" lazy />   // the one reviews list — see below
```

`openCreatePlace()` starts the wizard (layer → category → point → details); a prefilled `layer`
skips the first step, a prefilled `point` skips picking. Wrap it in `requireAuth`. The details
step shows «Локация: …» detected from the point exactly like the server does it (smallest
territory containing the point, `shared/lib/polygon`), with «Изменить» → another area or «Не
относится к локации» (`area_id` omitted / id / `null`). The place card shows a «← Нагорный парк»
breadcrumb.

**Reviews, ratings and photos from other services** (SPEC §20, §22; backend flag
`EXTERNAL_REVIEWS_ENABLED`): Маяк aggregates Yandex Maps, 2GIS and Google Maps next to its own
reviews. Everything lives in `features/places/external/`:

- `<ReviewFeed target own? />` — the **one** reviews list of a card (`card/ReviewsTab.tsx` with
  our reviews, `areas/card/AreaBody.tsx` external-only and lazy on scroll). Order (`feed.ts`): up to
  five of our newest reviews, then everything else in turns across the sources — our remaining
  reviews take part as «Маяк». Every card (`ReviewCard`) carries a `SourceMark`: the lighthouse for
  «Маяк» (`LogoMark round`), Я / 2 / G for the services; ours keep the author, the others stay
  anonymous. Filter chips «Все», Маяк and each service with its rating and count; ten cards at a
  time («Показать ещё», client-side), a filter change resets the page. Once everything loaded is
  shown and a visible source has `has_more`, «Загрузить ещё из 2ГИС» calls
  `GET …/external-reviews/more?source=` for one source (the one with the fewest reviews loaded),
  merges the entry into both cached answers and appends the new cards at the end — only on a
  press, one call in flight, never retried; 409 hides the button, other errors show a quiet line.
  While the lookup runs, the services still being asked (`pending_sources`) are dimmed chips with
  a spinner, plus skeleton cards; polling every 2 s as long as `pending`.
- `<RatingSummary item target ownLabel />` — the card's single rating line under the title
  (place and area): with `combined_rating` «★ 4,8 · marks · 54 тыс. оценок», otherwise each
  source's rating behind its mark; a tap opens `RatingBreakdown` — «Оценка по Маяку и картам»,
  every part with its rating and count and a note that it is not the residents' rating. Reads
  `?cached_only=true` only. The reviews tab header shows the same value with the label; lists show
  `<ListRating item />` (`@/shared/ui`, combined or `rating_avg`, `shownRating()` in
  `@/shared/lib/rating`). `ElsewhereLinks` no longer repeats the 2GIS rating.
- `useExternalPhotos` + `<ExternalPhotos />`, `<ExternalPhotoStrip />` — the sources' hot-linked
  photos (`referrerPolicy="no-referrer"`, broken ones drop out) as a gallery / cover fallback and
  inside the list, each credited «Фото: Яндекс Карты»; a tap opens the viewer. Never a list cover.

A cache miss on the full answer (`useExternalReviews`) is a real lookup at the sources: fetched once
per session, never retried, lazy on areas; lists never call any of it. Eligibility of places is
`isExternalReviewsTarget(place)` (tourism, or a named facility); other places get the same list
with our reviews only (`target={null}`).

**Photo viewer**: every photo opens `<Lightbox photos index onIndexChange alt />` (`@/shared/ui`).
It takes our `Photo` records as they are or `ViewerPhoto`s — `{ url, source: { label, url } }` for
hot-linked photos, optional `caption` and `action` (the area cover offers «Открыть место»).
Desktop: arrows, thumbnails, ← → Esc, + / − and the wheel to zoom, click outside the photo to
close, counter «3 / 12». Touch: swipe, pull down to dismiss, pinch / double tap to zoom and pan.
Focus trap and return, scroll lock, neighbours preloaded, reduced motion respected.

**Free texts** (SPEC §19, §21): a description taken from Wikivoyage or Wikipedia carries
`description_credit`; show it with `<TextCreditNote credit />` («Текст: Викигид, CC BY-SA 4.0») right
under the text — done in the place and area cards. `isUnconfirmedImport(place)`
(`@/shared/lib/imports`) — an OSM or Wikivoyage object no resident has confirmed: its source
badge instead of a trust badge, «Ждёт подтверждения жителей» in the card.

**OpenStreetMap layer** (SPEC §18): `isUnconfirmedOsm(place)` (`@/shared/lib/osm`) — an OSM object
no resident has confirmed: a small white background pin, left out by the trust filters. Zoomed
out, explore asks `GET /places` for community content + live imports only (`origin`), and
`GET /areas` with `min_places=1`; OSM objects come in from `PLACE_UNFOLD_ZOOM`. Credit OSM data
with `<OsmCredit />` («© участники OpenStreetMap», ODbL); external photos with
`<PhotoCreditLink credit />` (gallery, lightbox) and `<CreditMark credit />` («©» on covers —
`PlacePhoto credit={place.cover_credit}`).

## Areas (`@/features/areas`, SPEC §17)

A location («Нагорный парк») is the hero; its places are folded into it on the map and browsed
in its card. The shell renders `<AreaLayer />` (pills + territories) and pushes `<AreaPanel />`
(`?area=<id>`) and `<AreaEditorPanel />` on top of the current panel section.

```tsx
useMapAreas(areas);                           // AreaCard[] → interest-tinted pills; faint territories
                                              //   from TERRITORY_TINT_ZOOM (14); explore owns it
<AreaListItem area={card} />                  // rich list card: cover, kind, tier + meter, count, highlights
const canCreate = useCanManageAreas();        // level trusted+ or moderator (others: no entry point)
requireAuth(() => openCreateArea({ point, title, objectId, geometry, radiusM }));
openEditArea(areaId);
<CreateAreaHint />                            // explore's entry point, renders nothing for others
const onTap = useAreaAwareTap(openSpot);      // tapped 2GIS object linked to an area → area card
<AreaPanel areaId={id} renderNotes={({ objectId, point }) => <ObjectNotesPreview … />} />
```

The territory editor: «Границы» — «Найти» (`GET /areas/geometry-lookup` by the tapped object or
by name near the map centre, candidates previewed on the map with their source), «Нарисовать»
(tap to add, drag / hold / midpoint handles, undo, live area, self-intersection check in
`areas/lib/geometry.ts`), «Круг» (centre under the pin + radius); any of them can be refined by
hand — then «О локации» (title, kind, description); 403 / 409 / 422 are shown in the form.
Interest tiers: `interestLabel(interest)` in `@/shared/lib/labels` (< 25 / < 50 / < 75 / ≥ 75).

## API layer (`@/shared/api`)

`authApi`, `usersApi`, `catalogApi`, `placesApi`, `areasApi`, `eventsApi`, `uploadsApi`, `routesApi`,
`complaintsApi`, `collectionsApi`, `notificationsApi`, `notesApi`, `outagesApi`,
`moderationApi`, `statsApi` — typed functions over `api.get/post/put/patch/delete/blob`.

```ts
const route = useQuery({ queryKey: queryKeys.routes.detail(id), queryFn: () => routesApi.get(id) });
const save = useMutation({
  mutationFn: () => routesApi.save(id),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.routes.all }),
  onError: (error) => toast.error(errorMessage(error)),      // ApiError: { status, code, detail, errors[] }
});
applyServerErrors(error, setError, ['title', 'description']);   // '@/shared/lib/serverErrors' — 422 → form fields
```

A 401 with a token logs the user out. Keys always come from `queryKeys` (`queryKeys.places.lists`
invalidates every place list, `queryKeys.places.detail(id)` one card, …).

## UI kit (`@/shared/ui`)

Controls: `Button` (+ `buttonClasses()` for links), `IconButton`, `HeartButton`, `Input`,
`Textarea`, `Select`, `Field`, `Switch`, `Chip`, `SegmentedControl`, `Tabs`, `RatingInput`.
Feedback: `Badge`, `Banner`, `Skeleton`, `ListSkeleton`, `Spinner`, `EmptyState`, `ErrorState`,
`toast.success/error/info`, `Tooltip`. Overlays: `Modal`, `ConfirmDialog`, `Popover`,
`Dropdown` (+ `DropdownItem`, `DropdownLabel`, `DropdownSeparator`), `Lightbox`, `PhotoGrid`.
Ratings: `RatingStars`, `ListRating`; brand: `LogoMark`.
Domain: `TrustBadge`, `TrustMeter`, `LevelBadge`, `ExternalBadge`, `UserChip`, `Avatar`,
`LayerIcon`, `CategoryIcon`, `CategoryGlyph`, `PlacePhoto`, `RatingStars`.

Tokens (Tailwind classes): colours `ink`, `ink-soft`, `ink-faint`, `line`, `canvas`, `surface`,
`brand`, `beam`, layers `infrastructure | event | tourism | issue` and `success | warning |
danger | official` — each with `-soft` and `-ink`; radii `rounded-panel | card | control`;
shadows `shadow-card | float | pin`; `font-display` (Unbounded) for titles and big numbers;
utilities `glass`, `scroll-area`, `no-scrollbar`, `skeleton`, `tap-target` (44 px hit area).
`TONES[tone].soft | solid | text | fill | border` (`@/shared/lib/tones`) maps a semantic tone
to classes.

Every enum has Russian label / tone / icon in `@/shared/lib/labels` (`LAYER_META`,
`STATUS_META`, `VOTE_META`, `LEVEL_META`, `PHASE_META`, `ISSUE_STAGE_META`, `SEVERITY_META`,
`ROUTE_KIND_META`, `ROUTE_DIFFICULTY_META`, `ROUTE_VISIBILITY_META`, `PATH_MODE_META`,
`STOP_KIND_META`, `OUTAGE_RESOURCE_META`, `EXTERNAL_SOURCE_META`, `COMPLAINT_REASON_META`,
`MODERATION_TRIGGER_META`, `MODERATION_ACTION_META`, `AI_VERDICT_META`, `AI_CATEGORY_LABELS`,
`NOTIFICATION_KIND_META`, `HISTORY_KIND_META`, `AREA_KIND_META`, `AREA_GEOMETRY_SOURCE_META`,
`interestLabel()`). Territory geometry helpers (`pointInPolygon`, `polygonBounds`,
`polygonAreaM2`, `circlePolygon`) live in `@/shared/lib/polygon`. Text helpers in `@/shared/lib/format`:
`pluralize(3, PLURALS.place)`, `formatDateTime`, `formatRelative`, `formatEventRange`,
`formatDistance`, `formatDuration`, `formatPrice(price, note)`.

## Installable app (PWA)

The production build is an installable app that opens without a connection:

- `public/manifest.json` and `public/icons/` — name, colours, icons (regular, maskable, the iOS
  home-screen icon), shortcuts to the afisha, routes and saved places; `index.html` links them.
- `pwa/serviceWorkerPlugin.ts` (a Vite build plugin) emits `dist/sw.js` from
  `pwa/sw.template.js` with the list of the build's own files and a version derived from it, so
  every deploy ships a different worker. `src/app/registerServiceWorker.ts` registers it in
  production only — there is no worker in `npm run dev`.
- The worker caches the app shell only: page loads go to the network first and fall back to the
  cached shell; hashed bundles, fonts and icons come from the cache. The API, `/media/`, map
  tiles and other origins are never intercepted — offline, the lists show their «Нет связи» state.
- Serve `sw.js` and `manifest.json` with `Cache-Control: no-cache` (see `nginx.conf`); HTTPS is
  required outside `localhost`.

Check after changing any of it: `npm run build && npx vite preview`, then in Chrome DevTools →
Application: the manifest has no errors, the worker is activated, and the page reloads with
«Offline» ticked.

## Conventions

- UI text is Russian; code, comments and identifiers are English.
- Touch targets ≥ 44 px, inputs ≥ 16 px on phones, primary action in a `footer`.
- Loading → skeleton, empty → `EmptyState` with a next step, failure → `ErrorState` with retry.
- Optimistic updates for votes / favourites / join (see `features/places/card/usePlace.ts`).
- Docker: `docker build --build-arg VITE_2GIS_KEY=… .` → nginx serving `dist`, proxying `/api`
  and `/media` to `http://backend:8000`.
