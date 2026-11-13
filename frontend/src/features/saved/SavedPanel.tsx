import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';

import { useAuth } from '@/features/auth';
import { useMapPlaces } from '@/features/map';
import { pluralize, PLURALS } from '@/shared/lib/format';
import { ErrorState, ListSkeleton, PanelLayout, SPRING, Tabs, TWEEN } from '@/shared/ui';

import { CollectionsTab } from './CollectionsTab';
import { FavoritePlacesTab } from './FavoritePlacesTab';
import { PublicCollections } from './PublicCollections';
import { SavedRoutesTab } from './SavedRoutesTab';
import { SignInPrompt } from './SignInPrompt';
import { useMyCollections } from './useCollections';
import { useFavorites } from './useFavorites';
import { SAVED_TABS, useSavedTab, type SavedTab } from './useSavedTab';

function SavedTabs() {
  const favorites = useFavorites();
  const collections = useMyCollections();
  const { tab, setTab } = useSavedTab();
  const [direction, setDirection] = useState(1);
  useMapPlaces(favorites.data?.places);

  const select = (next: SavedTab) => {
    setDirection(SAVED_TABS.indexOf(next) >= SAVED_TABS.indexOf(tab) ? 1 : -1);
    setTab(next);
  };
  const places = favorites.data?.places.length;
  const routes = favorites.data?.routes.length;
  const subtitle =
    places !== undefined && routes !== undefined
      ? [
          pluralize(places, PLURALS.place),
          pluralize(routes, PLURALS.route),
          collections.data && pluralize(collections.data.length, PLURALS.collection),
        ]
          .filter(Boolean)
          .join(' · ')
      : 'Места, маршруты и подборки';

  const body = () => {
    if (tab === 'collections') return <CollectionsTab />;
    if (favorites.isPending) return <ListSkeleton rows={4} />;
    if (favorites.isError) {
      return <ErrorState error={favorites.error} onRetry={() => void favorites.refetch()} />;
    }
    return tab === 'places' ? (
      <FavoritePlacesTab places={favorites.data.places} />
    ) : (
      <SavedRoutesTab routes={favorites.data.routes} />
    );
  };

  return (
    <PanelLayout
      title="Избранное"
      subtitle={subtitle}
      toolbar={
        <Tabs
          label="Разделы избранного"
          value={tab}
          onChange={select}
          className="-mx-4 px-2 lg:-mx-5 lg:px-3"
          tabs={[
            { value: 'places', label: 'Места', count: places },
            { value: 'routes', label: 'Маршруты', count: routes },
            { value: 'collections', label: 'Подборки', count: collections.data?.length },
          ]}
        />
      }
    >
      <AnimatePresence mode="popLayout" initial={false} custom={direction}>
        <motion.div
          key={tab}
          custom={direction}
          variants={{
            enter: (dir: number) => ({ opacity: 0, x: 24 * dir }),
            center: { opacity: 1, x: 0, transition: SPRING.sheet },
            leave: (dir: number) => ({ opacity: 0, x: -24 * dir, transition: TWEEN.fast }),
          }}
          initial="enter"
          animate="center"
          exit="leave"
          className="pt-1"
        >
          {body()}
        </motion.div>
      </AnimatePresence>
    </PanelLayout>
  );
}

/** «Избранное»: favorite places (on the map too), saved routes and collections. */
export default function SavedPanel() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isAuthenticated && !isLoading) return <SavedTabs />;

  return (
    <PanelLayout title="Избранное" subtitle="Места, маршруты и подборки">
      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : (
        <div className="flex flex-col gap-6">
          <SignInPrompt />
          <PublicCollections />
        </div>
      )}
    </PanelLayout>
  );
}
