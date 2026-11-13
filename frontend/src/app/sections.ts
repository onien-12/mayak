import { lazy } from 'react';

/** Lazily loaded section entry points (one chunk per section). */
export const EventsPanel = lazy(() => import('@/features/events/EventsPanel'));
export const RoutesPanel = lazy(() => import('@/features/routes/RoutesPanel'));
export const RoutePage = lazy(() => import('@/features/routes/RoutePage'));
export const RoutePrintPage = lazy(() => import('@/features/routes/RoutePrintPage'));
export const RouteBuilder = lazy(() => import('@/features/routes/RouteBuilder'));
export const QuestPage = lazy(() => import('@/features/routes/QuestPage'));
export const QuestEditorPage = lazy(() => import('@/features/routes/QuestEditorPage'));
export const QuestRunPage = lazy(() => import('@/features/routes/QuestRunPage'));
export const QuestJoinPage = lazy(() => import('@/features/routes/QuestJoinPage'));
export const SavedPanel = lazy(() => import('@/features/saved/SavedPanel'));
export const CollectionPage = lazy(() => import('@/features/saved/CollectionPage'));
export const ProblemsPanel = lazy(() => import('@/features/problems/ProblemsPanel'));
export const LostPanel = lazy(() => import('@/features/lost/LostPanel'));
export const LostEditor = lazy(() => import('@/features/lost/LostEditor'));
export const LostItemPage = lazy(() => import('@/features/lost/LostItemPage'));
export const ProfilePage = lazy(() => import('@/features/profile/ProfilePage'));
export const ModerationPage = lazy(() => import('@/features/moderation/ModerationPage'));
export const CasePage = lazy(() => import('@/features/moderation/CasePage'));
export const SpotSheet = lazy(() => import('@/features/spot/SpotSheet'));
export const StatsPage = lazy(() => import('@/features/stats/StatsPage'));
