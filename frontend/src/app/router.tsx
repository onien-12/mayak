import { Suspense } from 'react';
import { createBrowserRouter } from 'react-router';

import { RequireAuth } from '@/features/auth';
import { ExplorePanel } from '@/features/explore';

import {
  CasePage,
  CollectionPage,
  EventsPanel,
  ModerationPage,
  OutagesPanel,
  ProfilePage,
  RouteBuilder,
  RoutePage,
  RoutePrintPage,
  RoutesPanel,
  SavedPanel,
  StatsPage,
} from './sections';
import { AppShell } from './shell/AppShell';
import { NotFoundPanel } from './shell/NotFoundPanel';
import { OverlayRoute } from './shell/OverlayRoute';
import { PanelRoute } from './shell/PanelRoute';
import { RouteError } from './shell/RouteError';

export const router = createBrowserRouter([
  {
    // Standalone, print-friendly: outside the app shell and the map.
    path: 'routes/:id/print',
    element: (
      <Suspense fallback={null}>
        <RoutePrintPage />
      </Suspense>
    ),
    errorElement: <RouteError />,
  },
  {
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      {
        element: <PanelRoute />,
        children: [
          { index: true, element: <ExplorePanel /> },
          { path: 'events', element: <EventsPanel /> },
          { path: 'routes', element: <RoutesPanel /> },
          { path: 'routes/new', element: <RouteBuilder /> },
          { path: 'routes/:id', element: <RoutePage /> },
          { path: 'routes/:id/edit', element: <RouteBuilder /> },
          { path: 'outages', element: <OutagesPanel /> },
          { path: 'saved', element: <SavedPanel /> },
          { path: 'collections/:id', element: <CollectionPage /> },
          { path: '*', element: <NotFoundPanel /> },
        ],
      },
      {
        element: <OverlayRoute />,
        children: [
          { path: 'users/:id', element: <ProfilePage /> },
          {
            path: 'profile',
            element: (
              <RequireAuth reason="чтобы открыть свой профиль">
                <ProfilePage />
              </RequireAuth>
            ),
          },
          {
            path: 'moderation',
            element: (
              <RequireAuth moderator>
                <ModerationPage />
              </RequireAuth>
            ),
          },
          {
            path: 'moderation/:caseId',
            element: (
              <RequireAuth moderator>
                <CasePage />
              </RequireAuth>
            ),
          },
          { path: 'stats', element: <StatsPage /> },
        ],
      },
    ],
  },
]);
