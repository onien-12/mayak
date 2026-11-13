import { Outlet } from 'react-router';

import { AreaLayer } from '@/features/areas';
import { AuthModal } from '@/features/auth';
import { InterestsHost, InterestsOnboarding } from '@/features/interests';
import { MapHost } from '@/features/map';
import { useIsDesktop } from '@/shared/hooks';
import { Toaster } from '@/shared/ui';

import { BottomBar } from './BottomBar';
import { MapChrome } from './MapChrome';
import { NavRail } from './NavRail';
import { useShellMapPadding } from './useShellMapPadding';

/**
 * The application frame: an always-mounted map with navigation and floating controls on
 * top; the matched route renders either into the side panel or as an overlay page.
 */
export function AppShell() {
  const isDesktop = useIsDesktop();
  useShellMapPadding();

  return (
    <div className="relative h-full overflow-hidden">
      <MapHost />
      <AreaLayer />
      <MapChrome />
      <Outlet />
      {isDesktop ? <NavRail /> : <BottomBar />}
      <AuthModal renderOnboarding={(done) => <InterestsOnboarding onDone={done} />} />
      <InterestsHost />
      <Toaster />
    </div>
  );
}
