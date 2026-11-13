import { MapPin } from 'lucide-react';
import { motion } from 'motion/react';

import { usePlaceParam } from '@/features/map';
import type { PlaceCard } from '@/shared/api';
import { useCategories } from '@/shared/hooks';
import { cn } from '@/shared/lib/cn';
import { pluralize, PLURALS } from '@/shared/lib/format';
import { PlacePhoto, PRESS_SCALE, SPRING, STAGGER_STEP, TWEEN } from '@/shared/ui';

import { LiveDot } from './EventBadges';
import { eventTimeLabel } from './eventTime';

/** Highlighted horizontal strip of events that are happening right now. */
export function OngoingStrip({ events }: { events: readonly PlaceCard[] }) {
  const { openPlace } = usePlaceParam();
  const { byId } = useCategories();
  if (events.length === 0) return null;

  return (
    <section
      aria-label="Идёт сейчас"
      className="rounded-card bg-linear-to-br from-event-soft to-event-soft/40 pt-3 pb-0.5"
    >
      <h2 className="mb-2 flex items-center gap-2 px-3 text-sm font-semibold text-event-ink">
        <LiveDot />
        Идёт сейчас
        <span className="font-normal text-ink-soft">
          · {pluralize(events.length, PLURALS.event)}
        </span>
      </h2>
      <ul className="no-scrollbar flex snap-x scroll-px-3 gap-2.5 overflow-x-auto px-3 pb-3">
        {events.map((place, index) => (
          <motion.li
            key={place.id}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ ...SPRING.sheet, delay: index * STAGGER_STEP }}
            className={cn(
              'shrink-0 snap-start',
              events.length === 1 ? 'w-full' : 'w-64 max-w-[85%]',
            )}
          >
            <motion.button
              type="button"
              whileTap={{ scale: PRESS_SCALE }}
              transition={TWEEN.fast}
              onClick={() => openPlace(place.id)}
              className="flex w-full items-center gap-3 rounded-card border border-event/20 bg-surface p-2 text-left shadow-card"
            >
              <PlacePhoto
                src={place.cover_url}
                credit={place.cover_credit}
                layer="event"
                slug={byId.get(place.category_id)?.slug}
                alt={place.title}
                className="size-14 shrink-0 rounded-control"
              />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-sm leading-tight font-semibold text-ink">
                  {place.title}
                </span>
                {place.event && (
                  <span className="mt-0.5 block truncate text-xs font-medium text-event-ink">
                    {eventTimeLabel(place.event, false)}
                  </span>
                )}
                {place.address && (
                  <span className="flex items-center gap-1 truncate text-xs text-ink-soft">
                    <MapPin size={11} aria-hidden className="shrink-0" />
                    <span className="truncate">{place.address}</span>
                  </span>
                )}
              </span>
            </motion.button>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}
