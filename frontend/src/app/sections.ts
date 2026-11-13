import { lazy } from 'react';

/** Lazily loaded section entry points (one chunk per section). */
export const EventsPanel = lazy(() => import('@/features/events/EventsPanel'));
export const RoutesPanel = lazy(() => import('@/features/routes/RoutesPanel'));
export const RoutePage = lazy(() => import('@/features/routes/RoutePage'));
export const RoutePrintPage = lazy(() => import('@/features/routes/RoutePrintPage'));
export const RouteBuilder = lazy(() => import('@/features/routes/RouteBuilder'));
export const SavedPanel = lazy(() => import('@/features/saved/SavedPanel'));
export const CollectionPage = lazy(() => import('@/features/saved/CollectionPage'));
export const OutagesPanel = lazy(() => import('@/features/outages/OutagesPanel'));
export const ProfilePage = lazy(() => import('@/features/profile/ProfilePage'));
export const ModerationPage = lazy(() => import('@/features/moderation/ModerationPage'));
export const CasePage = lazy(() => import('@/features/moderation/CasePage'));
export const SpotSheet = lazy(() => import('@/features/spot/SpotSheet'));
export const StatsPage = lazy(() => import('@/features/stats/StatsPage'));
