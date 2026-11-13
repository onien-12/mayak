import {
  AtSign,
  CalendarClock,
  CalendarX,
  ExternalLink,
  Gift,
  HandHelping,
  Lock,
  LockOpen,
  MapPin,
  PackagePlus,
  Repeat,
  Ticket,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import { useState } from 'react';

import { requireAuth, useAuth } from '@/features/auth';
import { usePlaceParam } from '@/features/map';
import type { EventDetail, PlaceDetail } from '@/shared/api';
import { eventWording, FORMAT_SLUGS, type EventWording } from '@/shared/lib/eventFormats';
import { capitalize, formatEventRange, formatPrice, formatRelative } from '@/shared/lib/format';
import { EXTERNAL_SOURCE_META, PHASE_META } from '@/shared/lib/labels';
import {
  Badge,
  Banner,
  Button,
  buttonClasses,
  ConfirmDialog,
  Input,
  TrustBadge,
} from '@/shared/ui';

import { Contributions, Participants, Seats } from './EventPeople';
import { useParticipation, useUpdatePlace } from './usePlace';

const JOIN_BLOCKED: readonly EventDetail['phase'][] = ['closed', 'finished', 'cancelled'];
/** Phases the line under the date already tells («Начало через 2 часа») — no badge for them. */
const PHASE_IN_TEXT: readonly EventDetail['phase'][] = ['soon', 'open'];
const NOTE_MAX_LENGTH = 300;

interface OrganizerControlsProps {
  place: PlaceDetail;
  event: EventDetail;
  wording: EventWording;
}

function OrganizerControls({ place, event, wording }: OrganizerControlsProps) {
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
        {event.registration_closed ? wording.openRegistration : wording.closeRegistration}
      </Button>
      <Button size="sm" variant="secondary" icon={CalendarX} onClick={() => setCancelling(true)}>
        {wording.cancel}
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
        title={`${wording.cancel}?`}
        description="Все, кто записался, получат уведомление об отмене. Вернуть после этого нельзя."
        confirmLabel={wording.cancel}
        cancelLabel="Не отменять"
        danger
        loading={update.isPending}
      />
    </div>
  );
}

/** A giveaway: what is given away and whether one may bring their own (SPEC §3.4). */
function SwapOffer({ place }: { place: PlaceDetail }) {
  const offer = place.attributes.offer;
  const bringOwn = place.attributes.bring_own;
  if (typeof offer !== 'string' && typeof bringOwn !== 'boolean') return null;
  return (
    <div className="rounded-control bg-white/70 px-3 py-2.5 text-sm text-ink">
      {typeof offer === 'string' && (
        <p>
          <span className="block text-xs text-ink-soft">Что отдают</span>
          {offer}
        </p>
      )}
      {typeof bringOwn === 'boolean' && (
        <p className="mt-1 text-xs text-ink-soft">
          {bringOwn
            ? 'Можно принести своё — напишите, что именно, когда записываетесь.'
            : 'Организатор просит ничего с собой не приносить.'}
        </p>
      )}
    </div>
  );
}

/**
 * Event block of the card: when, price, seats, join / leave, participants, organizer tools —
 * in the words of the format: a giveaway lists what people bring, a request for help is
 * answered with «Помогу». The source and the trust details are in the card menu.
 */
export function EventSection({ place }: { place: PlaceDetail }) {
  const { openPlace } = usePlaceParam();
  const participation = useParticipation(place.id);
  const { user } = useAuth();
  const [note, setNote] = useState('');
  const event = place.event;
  if (!event) return null;

  const slug = place.category.slug;
  const wording = eventWording(slug);
  const isSwap = slug === FORMAT_SLUGS.swap;
  const isHelp = slug === FORMAT_SLUGS.help;
  const phase = PHASE_META[event.phase];
  const over = event.phase === 'finished' || event.phase === 'cancelled';
  // The author of a request does not respond to it themselves.
  const ownRequest = isHelp && user?.id === place.author_id;
  const canJoin = !JOIN_BLOCKED.includes(event.phase) && !(ownRequest && !event.is_joined);
  const asksNote =
    isSwap && place.attributes.bring_own !== false && !over && (canJoin || event.is_joined);
  const typed = note.trim();

  const send = (join: boolean, withNote: boolean) =>
    requireAuth(
      () =>
        participation.mutate(
          { join, note: withNote && typed ? typed : undefined },
          { onSuccess: () => withNote && setNote('') },
        ),
      wording.authReason,
    );

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
        {wording.badge && (
          <Badge tone="event" icon={isHelp ? HandHelping : Gift} size="md" className="bg-white/80">
            {wording.badge}
          </Badge>
        )}
        {/* A good deed has no price; a giveaway says «бесплатно» — that is the point of it. */}
        {!isHelp && (
          <Badge
            tone={event.price === 0 ? 'success' : 'neutral'}
            icon={Ticket}
            size="md"
            className="bg-white/80"
          >
            {formatPrice(event.price, event.price_note)}
          </Badge>
        )}
        {event.age_limit !== null && (
          <Badge size="md" className="bg-white/80">
            {event.age_limit}+
          </Badge>
        )}
        {event.series_id && (
          <Badge icon={Repeat} size="md" className="bg-white/80">
            Повторяется
          </Badge>
        )}
      </div>

      {isSwap && <SwapOffer place={place} />}

      {event.is_cancelled ? (
        <Banner tone="danger" icon={CalendarX} title={wording.cancelled}>
          Все, кто записался, получили уведомление.
        </Banner>
      ) : (
        <>
          <Seats event={event} wording={wording} />
          <Participants placeId={place.id} count={event.participants_count} />
        </>
      )}
      {isSwap && <Contributions placeId={place.id} count={event.participants_count} />}

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
            <span className="block text-xs text-ink-soft">{wording.contactLabel}</span>
            {event.contact}
          </span>
        </p>
      )}
      {event.is_meetup && !event.contact && !over && (
        <p className="text-xs text-ink-soft">{wording.contactHidden}</p>
      )}

      {!over && (
        <div className="flex flex-col gap-2">
          {asksNote && (
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <Input
                  aria-label="Что принесёте — по желанию"
                  placeholder={event.is_joined ? 'Принесу ещё…' : 'Что принесёте?'}
                  value={note}
                  maxLength={NOTE_MAX_LENGTH}
                  onChange={(input) => setNote(input.target.value)}
                  className="bg-white"
                />
              </div>
              {event.is_joined && (
                <Button
                  variant="secondary"
                  icon={PackagePlus}
                  disabled={!typed}
                  loading={participation.isPending && Boolean(typed)}
                  onClick={() => send(true, true)}
                >
                  Добавить
                </Button>
              )}
            </div>
          )}
          {(canJoin || event.is_joined) && (
            <Button
              block
              size="lg"
              variant={event.is_joined ? 'secondary' : 'primary'}
              icon={event.is_joined ? UserCheck : isHelp ? HandHelping : UserPlus}
              loading={participation.isPending && !(event.is_joined && typed)}
              onClick={() => send(!event.is_joined, !event.is_joined)}
            >
              {event.is_joined ? wording.joined : wording.join}
            </Button>
          )}
          {!canJoin && !event.is_joined && !ownRequest && (
            <p className="rounded-control bg-white/70 px-3 py-2.5 text-center text-sm text-ink-soft">
              {event.seats_left === 0 ? wording.full : wording.closed}
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
        <OrganizerControls place={place} event={event} wording={wording} />
      )}
    </section>
  );
}
