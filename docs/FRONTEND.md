# Frontend — structure and design

React 19 + TypeScript (strict) + Vite, Tailwind CSS v4, TanStack Query v5, React Router v7,
Zustand (small UI/map state), react-hook-form + zod (forms), lucide-react (icons),
**2GIS MapGL JS API** (`@2gis/mapgl`, `@2gis/mapgl-clusterer`). Package manager: npm.
UI language: Russian only. Light theme only.

Dev: Vite on `:5173`, proxy `/api` and `/media` → `http://localhost:8000`.
Env (`frontend/.env`, git-ignored; `.env.example` committed): `VITE_2GIS_KEY`.

## 2GIS usage and quota

The demo key allows **1000 requests / month** for Suggest / Places / Geocoder. MapGL itself is
not metered. Therefore:

- Route lines are built **only by the backend** (`POST /routes/preview`, route create/update) on
  OpenStreetMap data through the public FOSSGIS OSRM server (fair use: ≤ 1 request a second);
  the frontend never calls a routing API. Preview is requested on explicit stop changes,
  debounced ≥ 800 ms, and cached by TanStack Query (`staleTime: Infinity`, key = kind + points).
  Wherever a route line is shown for keeps (route page, print page) it is credited
  «Линия маршрута: © участники OpenStreetMap».
- Address search uses Suggest (`https://catalog.api.2gis.com/3.0/suggests?q=…&location=<lng>,<lat>&fields=items.point&key=…`):
  min 3 chars, debounce ≥ 450 ms, cached. Reverse geocoding
  (`https://catalog.api.2gis.com/3.0/items/geocode?lat=…&lon=…&fields=items.point&key=…`) only
  once per confirmed pin position in the create form (not on every drag frame). Forward
  `items/geocode?q=` is **not** available on this key — use Suggest.
- Both degrade silently: if 2GIS search fails, address stays a plain manual text field.
- When `VITE_2GIS_KEY` is missing the map area shows a friendly instruction instead of crashing.
- Always check current docs before using an API: https://docs.2gis.com/ru/mapgl/overview ,
  https://docs.2gis.com/ru/mapgl/clustering/overview .

Map defaults: center `[131.8869, 43.1155]` (lng, lat — Vladivostok centre), zoom 13.

## Source layout

```
frontend/src/
  app/            App.tsx, router.tsx, providers.tsx, AppShell (nav rail / bottom bar, map host, panel outlet)
  shared/
    api/          client.ts (fetch wrapper, ApiError, token), types.ts (mirror of docs/API.md), one module per domain (places.ts, events.ts, routes.ts …), queryKeys.ts
    ui/           design-system primitives (Button, IconButton, Input, Textarea, Select, Switch, Chip, Badge, Tabs, SegmentedControl,
                  Sheet/Panel, Modal, Dropdown, Tooltip, Toast, Avatar, Skeleton, EmptyState, Spinner, RatingStars, PhotoGrid …)
    lib/          format.ts (dates, distance, plurals — Russian), geo.ts, labels.ts (enum → Russian label/colour/icon), cn.ts
    hooks/
  features/
    map/          MapProvider (single MapGL instance), marker layer, clusterer, user location, pick-point mode, route line, issue radius
    auth/         auth store, login/register modal with captcha, RequireAuth
    explore/      «Карта» panel: layer switch, category chips, quick filters, trust filter, search, list of visible places
    places/       PlaceCard panel (all layers), verification block, reviews, comments, history, complaint dialog, create/edit wizard, photo upload
    notifications/ bell + dropdown
    interests/    topics, interest profile (account or this browser), «Что вам интересно?» picker, «Для вас» strip, topic chips (SPEC §23)
    events/       «Афиша» panel (filters, list ↔ map)                              [phase 2]
    routes/       list, route page with map line, route builder                     [phase 2]
    saved/        favorites + collections                                           [phase 2]
    profile/      user page, reputation, level progress, respects, subscriptions    [phase 3]
    moderation/   queue, held items, case page, log                                 [phase 3]
    stats/        city statistics                                                   [phase 3]
```

Rules: features import from `shared/` and `features/map`, `features/auth`, `features/places`
public `index.ts` only — no deep cross-feature imports. No `any`. Server state lives in
TanStack Query only (no copies in stores). Components ≤ ~200 lines; extract hooks. No
dead code, no commented-out code, no TODO placeholders in delivered work.

## Screens and URLs

The map is **always mounted** (single instance, never re-created on navigation) — switching
sections must not lose the current viewport (brief §7.1). Sections render in a side panel
(desktop: left, 420 px, collapsible; mobile: bottom sheet with snap points) or as a wide
overlay page over the map.

| URL | Section | Kind |
|---|---|---|
| `/` | Карта (explore) | panel |
| `/?area=<id>` | area (location) card on top of any panel section — SPEC §17 | panel |
| `/?place=<id>` | place card on top of any panel section (query param works on `/`, `/events`, `/routes/*`, `/saved`, `/collections/*`) | panel |
| `/events` | Афиша | panel |
| `/routes`, `/routes/:id`, `/routes/new`, `/routes/:id/edit` | Маршруты | panel |
| `/saved`, `/collections/:id` | Избранное и подборки | panel |
| `/users/:id` (`/profile` → own) | Профиль | overlay page |
| `/moderation`, `/moderation/:caseId` | Модерация (mods only) | overlay page |
| `/stats` | Статистика города | overlay page |

Viewing needs no account (brief §7.4). Any write action by an anonymous user opens the auth
modal and resumes afterwards. Adding must be fast: only category, point, title are required;
category-specific fields are optional and revealed progressively.

## Mobile-first and motion (hard requirement from the product owner)

The phone is the **primary** target: design and build every screen for 390×844 first, then
adapt up to desktop. Desktop is the adaptation, not the other way round.

- Write styles mobile-first (base = phone, `md:`/`lg:` add the desktop layout). Use `100dvh`,
  `env(safe-area-inset-*)`, no hover-only affordances, touch targets ≥ 44 px, primary actions
  in the thumb zone (bottom), inputs ≥ 16 px font (no iOS zoom), no horizontal scroll.
- Mobile shell: full-screen map, bottom tab bar, floating «Добавить» FAB, search pill on top,
  horizontally scrollable filter chips, and a **draggable bottom sheet** with snap points
  (peek ≈ 96 px / half / full), real drag gestures with velocity-based snapping, rubber-band
  at the edges, scroll hand-off inside the sheet at full height, backdrop only at full. The
  place card, lists, forms and dialogs all live in sheets on mobile (dialogs → bottom sheets,
  menus → action sheets). The map pads its viewport so the selected marker stays visible above
  the sheet.
- Animation library: `motion` (`motion/react`). Motion is part of the design, not decoration:
  spring-based sheet/panel transitions, shared-layout transitions (list item → card, tab
  indicator, segmented control thumb), staggered list entrance, marker drop-in/pop and
  selected-marker pulse, press feedback (scale 0.97) on tappable surfaces, heart/vote
  micro-interactions (pop + colour fill, count ticking), animated `TrustMeter` and number
  count-up, skeleton shimmer, toast slide-in, route line drawing progressively, success
  state after publishing (confetti-free, tasteful: checkmark draw + beam sweep), page/overlay
  transitions (slide-up on mobile, fade/scale on desktop), pull-down-to-dismiss on photo
  lightbox with pinch/swipe between photos.
- Keep it fast: animate only `transform`/`opacity`, 60 fps on mid-range phones, durations
  150–350 ms, springs not bouncy (damping high), no layout thrash on the map. Honour
  `prefers-reduced-motion` (fall back to fades).
- Weak devices get a **lite graphics tier** (`<html data-graphics="lite">`, chosen automatically
  from hardware hints and measured frame times, overridable in profile settings «Графика»):
  same layout, content and colours, but no backdrop blur, lighter shadows, no infinite
  decorative animations, fades instead of springs, flat map pins and MapGL's light preset. The
  full tier stays exactly as designed. Details: `frontend/README.md` → «Graphics tier».
- Verify at 390×844 **first** (then 1440×900) with screenshots; also check 360×740.

## Design direction — «Маяк»

A lighthouse over a foggy sea port: calm, airy, confident; the map is the hero, UI floats above it.

- **Colour tokens** (CSS variables in `@theme`):
  ink `#0B1D2E`, ink-soft `#52647A`, ink-faint `#8A99AB`, line `#E2E8EE`, canvas `#F2F5F8`, surface `#FFFFFF`;
  brand navy `#0B2A4A` (primary buttons, logo), beam `#FFD23F` (accent: logo beam, active nav indicator, highlights — never body text);
  layers — infrastructure `#0EA5A4`, event `#7C5CFC`, tourism `#F97316`, issue `#E5484D`;
  semantic — success `#1F9D55`, warning `#E8A317`, danger `#D93D42`, official `#2563EB`.
  Each layer colour has a soft tint (≈ 12 % on white) for chips/badges.
- **Type**: `Onest Variable` for UI (400/500/600), `Unbounded` for the logo, big numbers and
  section titles only (600–700, tight tracking). Self-hosted via `@fontsource-variable/*`. Base 15 px, line-height 1.45.
- **Shape**: panels radius 20, cards 16, controls 12, chips/pills full. 1 px `line` borders,
  soft two-layer shadows. Floating panels: white at ~92 % with backdrop blur over the map.
  8-pt spacing grid; generous padding (panel 20 px).
- **Markers**: rounded pin in layer colour with white category icon; verification state readable
  at a glance — `verified` solid with a small check badge, `preliminary` solid, `unverified`
  white pin with coloured dashed border, `needs_review` warning badge, own `pending` greyed with
  clock. Official issue info → blue shield badge. Selected marker scales up with a beam-yellow
  ring. Clusters: navy circle with count. Issue radius: translucent red circle. Ongoing events pulse subtly.
- **Trust UI**: a consistent `TrustBadge` (status icon + label) and `TrustMeter` (0–100 bar)
  used in cards and lists; user content vs. official info vs. automatic assumptions are
  visually distinct (brief §7.3). Stale places show an amber «давно не проверялось» notice with a call to verify.
- **Motion**: 150–220 ms ease-out for panels, sheets, marker selection; skeletons while
  loading; optimistic updates for votes/favorites/join. Respect `prefers-reduced-motion`.
- **Photos**: every user or source photo opens the shared full-screen viewer (`Lightbox`) on
  tap/click; hot-linked photos keep `referrerPolicy="no-referrer"` and their source credit.
- **Ratings**: where a place or area shows stars, use the combined rating when the server has
  one, otherwise our own average; the combined one is always labelled as such («Оценка по Маяку
  и картам») with its parts one tap away — never presented as the residents' rating.
- **Empty/error states** are designed, friendly, Russian, with a next action.
- **Responsive**: ≥ 1024 px nav rail + side panel; < 1024 px bottom tab bar + bottom sheet;
  touch targets ≥ 44 px. Accessible: semantic HTML, focus rings, aria-labels on icon buttons,
  keyboard-closable dialogs, contrast AA.

No generic "admin template" look: no default Tailwind blue, no grey boxes on grey; the result
should feel like a polished consumer city app.
