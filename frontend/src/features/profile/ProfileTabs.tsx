import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef } from 'react';

import { Tabs, TWEEN } from '@/shared/ui';

import { PlacesTab } from './PlacesTab';
import { ReputationTab } from './ReputationTab';
import { RoutesTab } from './RoutesTab';
import { SettingsTab } from './SettingsTab';
import { SubscriptionsTab } from './SubscriptionsTab';
import type { useProfileTab } from './useProfileTab';

interface ProfileTabsProps {
  userId: number;
  own: boolean;
  onPickHome: () => void;
  state: ReturnType<typeof useProfileTab>;
}

export function ProfileTabs({ userId, own, onPickHome, state }: ProfileTabsProps) {
  const { tab, tabs, setTab } = state;
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = strip.current;
    const active = container?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!container || !active) return;
    const left = active.offsetLeft - (container.clientWidth - active.offsetWidth) / 2;
    container.scrollTo({ left, behavior: 'smooth' });
  }, [tab]);

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <div ref={strip} className="relative -mx-4 no-scrollbar overflow-x-auto px-4 lg:mx-0 lg:px-0">
        <Tabs
          label="Разделы профиля"
          value={tab}
          onChange={setTab}
          tabs={tabs}
          className="w-max min-w-full"
        />
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          role="tabpanel"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: TWEEN.fast }}
          transition={TWEEN.base}
        >
          {tab === 'places' && <PlacesTab userId={userId} own={own} />}
          {tab === 'routes' && <RoutesTab userId={userId} />}
          {tab === 'reputation' && <ReputationTab />}
          {tab === 'subscriptions' && <SubscriptionsTab />}
          {tab === 'settings' && <SettingsTab onPickHome={onPickHome} />}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}
