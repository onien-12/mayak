import { Plus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Link } from 'react-router';

import { requireAuth } from '@/features/auth';
import { MapControls } from '@/features/map';
import { NotificationBell } from '@/features/notifications';
import { openCreatePlace } from '@/features/places';
import { useIsDesktop } from '@/shared/hooks';
import { Button, LogoMark, popVariants, SPRING, usePanelStore, useTopBarSlots } from '@/shared/ui';

import { useIsOverlayRoute } from './navigation';

/**
 * The global «Добавить»: shown only while a section offers it (`useOfferAddPlace` — the
 * explore map with nothing on top), pops in and out everywhere else.
 */
function AddPlaceButton({ label }: { label: string }) {
  const offered = usePanelStore((state) => state.addPlaceOffers > 0);

  return (
    <AnimatePresence initial={false} mode="popLayout">
      {offered && (
        <motion.div
          key="add-place"
          variants={popVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <Button
            variant="accent"
            size="lg"
            icon={Plus}
            onClick={() => requireAuth(() => openCreatePlace(), 'чтобы добавить место на карту')}
            className="rounded-full shadow-float"
          >
            {label}
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Phone: «где я» and the «Добавить» FAB riding on the top edge of the bottom sheet. */
export function SheetFloating() {
  return (
    <>
      <motion.div layout="position" transition={SPRING.layout}>
        <MapControls zoom={false} />
      </motion.div>
      <AddPlaceButton label="Добавить" />
    </>
  );
}

/** Phone top bar: logo, the active section's search (see `MapTopBar`) and notifications. */
function MobileTopBar() {
  const setMain = useTopBarSlots((state) => state.setMain);
  const setExtra = useTopBarSlots((state) => state.setExtra);

  return (
    <header className="group/top pointer-events-none absolute inset-x-0 top-0 z-20 pt-[max(10px,env(safe-area-inset-top))]">
      <div className="flex items-center gap-2 px-3">
        <Link
          to="/"
          aria-label="Маяк — на главную"
          className="pointer-events-auto flex h-12 shrink-0 items-center gap-2 rounded-full border border-line/70 p-1.5 shadow-card glass group-has-[[data-top-slot]:empty]/top:pr-4"
        >
          <LogoMark size={36} className="rounded-full" />
          <span className="hidden font-display text-base font-bold text-brand group-has-[[data-top-slot]:empty]/top:inline">
            Маяк
          </span>
        </Link>
        <div
          ref={setMain}
          data-top-slot
          className="pointer-events-auto min-w-0 flex-1 empty:pointer-events-none"
        />
        <div className="pointer-events-auto shrink-0">
          <NotificationBell variant="surface" />
        </div>
      </div>
      <div ref={setExtra} className="pointer-events-auto mt-2 empty:hidden" />
    </header>
  );
}

/** Controls floating over the map: the phone top bar, or desktop «Добавить место» and zoom. */
export function MapChrome() {
  const isDesktop = useIsDesktop();
  const onOverlay = useIsOverlayRoute();

  if (!isDesktop) return onOverlay ? null : <MobileTopBar />;
  if (onOverlay) return null;

  return (
    <>
      <div className="absolute top-4 right-4 z-20">
        <AddPlaceButton label="Добавить место" />
      </div>
      <MapControls className="absolute right-4 bottom-8 z-20" />
    </>
  );
}
