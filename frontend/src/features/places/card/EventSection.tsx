import {
  AtSign,
  CalendarClock,
  CalendarX,
  ExternalLink,
  Lock,
  LockOpen,
  MapPin,
  Repeat,
  Ticket,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { useState } from 'react';

import { requireAuth } from '@/features/auth';
import { usePlaceParam } from '@/features/map';
import type { EventDetail, PlaceDetail } from '@/shared/api';
import { capitalize, formatEventRange, formatPrice, formatRelative } from '@/shared/lib/format';
import { EXTERNAL_SOURCE_META, PHASE_META } from '@/shared/lib/labels';
import { Badge, Banner, Button, buttonClasses, ConfirmDialog, TrustBadge } from '@/shared/ui';

import { Participants, Seats } from './EventPeople';
import { useParticipation, useUpdatePlace } from './usePlace';

const JOIN_BLOCKED: readonly EventDetail['phase'][] = ['closed', 'finished', 'cancelled'];
/** Phases the line under the date already tells («Начало через 2 часа») — no badge for them. */
const PHASE_IN_TEXT: readonly EventDetail['phase'][] = ['soon', 'open'];

function OrganizerControls({ place, event }: { place: PlaceDetail; event: EventDetail }) {
  const update = useUpdatePlace(place.id);
  const [cancelling, setCancelling] = useState(false);

  return (
    <div className="flex flex-wrap gap-2 border-t border-event/15 pt-3">
      <Button
        size="sm"
        variant="secondary"
        icon={event.registration_closed ? LockOpen : Lock}
        loading={update.isPending && !cancelling}
        onClick={() =>
          update.mutate({ event: { registration_closed: !event.registration_closed } })
        }
      >
        {event.registration_closed ? 'Открыть запись' : 'Закрыть запись'}
      </Button>
      <Button size="sm" variant="secondary" icon={CalendarX} onClick={() => setCancelling(true)}>
        Отменить событие
      </Button>
      <ConfirmDialog
        open={cancelling}
        onClose={() => setCancelling(false)}
        onConfirm={() =>
          update.mutate(
            { event: { is_cancelled: true } },
            { onSettled: () => setCancelling(false) },
          )
        }
        title="Отменить событие?"
        description="Все участники получат уведомление об отмене. Вернуть событие после этого нельзя."
        confirmLabel="Отменить событие"
        cancelLabel="Не отменять"
        danger
        loading={update.isPending}
      />
    </div>
  );
}

/**
 * Event block of the card: when, price, seats, join / leave, participants, organizer tools.
 * The source and the trust details are in the card menu; only «Не подтверждено» is said here.
 */
export function EventSection({ place }: { place: PlaceDetail }) {
  const { openPlace } = usePlaceParam();
  const participation = useParticipation(place.id);
  const event = place.event;
  if (!event) return null;

  const phase = PHASE_META[event.phase];
  const over = event.phase === 'finished' || event.phase === 'cancelled';
  const canJoin = !JOIN_BLOCKED.includes(event.phase);
  const toggle = () =>
    requireAuth(() => participation.mutate(!event.is_joined), 'чтобы записаться на событие');

  return (
    <section aria-label="Событие" className="flex flex-col gap-3 rounded-card bg-event-soft p-3.5">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-event text-white">
          <CalendarClock size={20} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base leading-snug font-semibold text-ink">
            {capitalize(formatEventRange(event.starts_at, event.ends_at))}
          </p>
          <p className="text-sm text-ink-soft">
            {event.phase === 'finished'
              ? `Закончилось ${formatRelative(event.ends_at)}`
              : event.phase === 'ongoing'
                ? `Закончится ${formatRelative(event.ends_at)}`
                : `Начало ${formatRelative(event.starts_at)}`}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {!PHASE_IN_TEXT.includes(event.phase) && (
          <Badge tone={phase.tone} icon={phase.icon} size="md" className="bg-white/80">
            {phase.label}
          </Badge>
        )}
        {!place.external && place.status === 'unverified' && (
          <TrustBadge status={place.status} size="md" className="bg-white/80" />
        )}
        <Badge
          tone={event.price === 0 ? 'success' : 'neutral'}
          icon={Ticket}
          size="md"
          className="bg-white/80"
        >
          {formatPrice(event.price, event.price_note)}
        </Badge>
        {event.age_limit !== null && (
          <Badge size="md" className="bg-white/80">
            {event.age_limit}+
          </Badge>
        )}
        {event.is_meetup && (
          <Badge tone="event" icon={Users} size="md" className="bg-white/80">
            Встреча жителей
          </Badge>
        )}
        {event.series_id && (
          <Badge icon={Repeat} size="md" className="bg-white/80">
            Повторяется
          </Badge>
        )}
      </div>

      {event.is_cancelled ? (
        <Banner tone="danger" icon={CalendarX} title="Событие отменено">
          Организатор отменил событие. Участники получили уведомление.
        </Banner>
      ) : (
        <>
          <Seats event={event} />
          <Participants placeId={place.id} count={event.participants_count} />
        </>
      )}

      {event.venue_place_id !== null && (
        <button
          type="button"
          onClick={() => openPlace(event.venue_place_id ?? place.id)}
          className="flex min-h-11 items-center gap-2 rounded-control bg-white/70 px-3 text-left text-sm font-medium text-event-ink"
        >
          <MapPin size={16} aria-hidden className="shrink-0" />
          Открыть место проведения
        </button>
      )}

      {event.contact && (
        <p className="flex items-start gap-2 rounded-control bg-white/70 px-3 py-2.5 text-sm text-ink">
          <AtSign size={16} aria-hidden className="mt-0.5 shrink-0 text-event-ink" />
          <span>
            <span className="block text-xs text-ink-soft">Контакт организатора</span>
            {event.contact}
          </span>
        </p>
      )}
      {event.is_meetup && !event.contact && !over && (
        <p className="text-xs text-ink-soft">
          Контакт организатора увидят только участники встречи.
        </p>
      )}

      {!over && (
        <div className="flex flex-col gap-2">
          {(canJoin || event.is_joined) && (
            <Button
              block
              size="lg"
              variant={event.is_joined ? 'secondary' : 'primary'}
              icon={event.is_joined ? UserCheck : UserPlus}
              loading={participation.isPending}
              onClick={toggle}
            >
              {event.is_joined ? 'Вы идёте · отменить участие' : 'Я пойду'}
            </Button>
          )}
          {!canJoin && !event.is_joined && (
            <p className="rounded-control bg-white/70 px-3 py-2.5 text-center text-sm text-ink-soft">
              {event.seats_left === 0 ? 'Все места заняты' : 'Организатор закрыл запись'}
            </p>
          )}
          {event.registration_url && !place.external && (
            <a
              href={event.registration_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 items-center justify-center gap-2 rounded-control text-sm font-medium text-event-ink hover:bg-white/60"
            >
              Регистрация на сайте организатора
              <ExternalLink size={15} aria-hidden />
            </a>
          )}
        </div>
      )}

      {place.external && (
        <a
          href={place.external.url}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClasses({ variant: 'secondary', block: true })}
        >
          {EXTERNAL_SOURCE_META[place.external.source].linkLabel}
          <ExternalLink size={16} aria-hidden />
        </a>
      )}

      {place.can_edit && !over && !place.external && (
        <OrganizerControls place={place} event={event} />
      )}
    </section>
  );
}
