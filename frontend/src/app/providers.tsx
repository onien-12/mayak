import { QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

import { MapProvider } from '@/features/map';
import { queryClient } from '@/shared/api';
import { useLiteGraphics } from '@/shared/ui';

export function Providers({ children }: { children: ReactNode }) {
  // Lite graphics: transform and layout animations snap, opacity still fades.
  const lite = useLiteGraphics();

  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion={lite ? 'always' : 'user'}>
        <MapProvider>{children}</MapProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
