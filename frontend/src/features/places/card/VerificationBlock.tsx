import { MessageSquarePlus, Navigation } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';

import { requireAuth, useAuth } from '@/features/auth';
import { useUserLocation } from '@/features/map';
import type { PlaceDetail, VoteKind } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { formatRelative } from '@/shared/lib/format';
import { haversine } from '@/shared/lib/geo';
import { VOTE_KINDS, voteMeta } from '@/shared/lib/labels';
import { isUnconfirmedImport } from '@/shared/lib/imports';
import { TONES } from '@/shared/lib/tones';
import { Button, Field, Pop, PRESS_SCALE, Textarea, TWEEN } from '@/shared/ui';

import { useVote } from './usePlace';

const NEARBY_M = 300;
/** «Требует уточнения» is only useful with words: the moderator has to know what to check. */
const MIN_CLARIFICATION = 5;
const VOTABLE: readonly PlaceDetail['status'][] = [
  'unverified',
  'preliminary',
  'verified',
  'needs_review',
];

/**
 * Collective verification: «Присутствует / Отсутствует / Требует уточнения» (issues:
 * «Проблема есть / Устранено / Ситуация изменилась»). One tap votes; voting again replaces
 * the previous vote. «Требует уточнения» first asks what exactly is wrong — the text goes to the
 * moderators with the vote.
 */
export function VerificationBlock({ place }: { place: PlaceDetail }) {
  const { user } = useAuth();
  const { location } = useUserLocation();
  const vote = useVote(place.id);
  const [comment, setComment] = useState('');
  const [commenting, setCommenting] = useState(false);
  const [clarifying, setClarifying] = useState(false);
  const [clarification, setClarification] = useState('');

  if (!VOTABLE.includes(place.status)) return null;

  const meta = voteMeta(place.layer);
  const isIssue = place.layer === 'issue';
  const own = user?.id === place.author_id;
  const myVote = place.verification.my_vote;
  const nearby = location ? haversine(location.point, place) <= NEARBY_M : false;

  const cast = (kind: VoteKind) =>
    requireAuth(() => {
      if (kind === 'unclear') {
        setClarifying(true);
        return;
      }
      vote.mutate({ kind, comment: comment.trim() });
      setComment('');
      setCommenting(false);
      setClarifying(false);
    }, 'чтобы подтвердить информацию');

  const clarify = () => {
    vote.mutate({ kind: 'unclear', comment: clarification.trim() });
    setClarification('');
    setClarifying(false);
  };

  return (
    <section aria-label="Проверка жителями">
      <h2 className="text-base font-semibold text-ink">
        {isIssue ? 'Проблема ещё актуальна?' : 'Были здесь? Подтвердите'}
      </h2>
      <p className="mt-0.5 text-sm text-ink-soft">
        {own
          ? 'Это ваша публикация — подтверждать её могут только другие жители.'
          : isUnconfirmedImport(place)
            ? `Объект из источника «${place.external?.label}». Видели его? Подтвердите — это поможет другим.`
            : 'Ваш голос помогает остальным понять, можно ли доверять этой метке.'}
      </p>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {VOTE_KINDS.map((kind) => {
          const { label, icon: Icon, tone } = meta[kind];
          const selected = myVote?.kind === kind;
          return (
            <motion.button
              key={kind}
              type="button"
              disabled={own}
              aria-pressed={selected}
              whileTap={{ scale: PRESS_SCALE }}
              transition={TWEEN.fast}
              onClick={() => cast(kind)}
              className={cn(
                'flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-card border px-1.5 py-2.5 text-center text-xs leading-tight font-medium transition-colors duration-150',
                'disabled:cursor-not-allowed disabled:opacity-45',
                selected
                  ? cn(TONES[tone].soft, TONES[tone].border)
                  : 'border-line bg-surface text-ink hover:border-ink-faint/60',
              )}
            >
              <Pop trigger={selected}>
                <Icon size={22} aria-hidden className={selected ? undefined : TONES[tone].text} />
              </Pop>
              {label}
            </motion.button>
          );
        })}
      </div>

      {clarifying && (
        <form
          className="mt-3 flex flex-col gap-2 rounded-card border border-line bg-canvas p-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (clarification.trim().length >= MIN_CLARIFICATION) clarify();
          }}
        >
          <Field
            label={isIssue ? 'Что изменилось?' : 'Что нужно уточнить?'}
            htmlFor="vote-clarification"
            hint="Увидит модератор — он проверит и поправит информацию."
          >
            <Textarea
              id="vote-clarification"
              value={clarification}
              onChange={(event) => setClarification(event.target.value)}
              rows={3}
              maxLength={500}
              placeholder={
                isIssue
                  ? 'Например: яму засыпали наполовину, проезд уже открыт'
                  : 'Например: вход с другой стороны, по выходным закрыто, неверное название'
              }
              autoFocus
            />
          </Field>
          <div className="flex gap-2">
            <Button
              type="submit"
              size="sm"
              disabled={clarification.trim().length < MIN_CLARIFICATION}
              loading={vote.isPending}
            >
              Отправить
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setClarifying(false)}>
              Отмена
            </Button>
          </div>
        </form>
      )}

      {myVote && (
        <p className="mt-2 text-sm text-ink-soft">
          Вы отметили: <span className="font-medium text-ink">{meta[myVote.kind].done}</span> ·{' '}
          {formatRelative(myVote.created_at)}. Можно изменить.
        </p>
      )}

      {!own && (
        <div className="mt-2 flex flex-col gap-2">
          {clarifying ? null : commenting ? (
            <Textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Что вы увидели? Комментарий уйдёт вместе с голосом"
              aria-label="Комментарий к голосу"
              autoFocus
            />
          ) : (
            <button
              type="button"
              onClick={() => setCommenting(true)}
              className="flex min-h-11 items-center gap-1.5 self-start text-sm font-medium text-brand"
            >
              <MessageSquarePlus size={16} aria-hidden />
              Добавить комментарий к голосу
            </button>
          )}
          <p
            className={cn(
              'flex items-center gap-1.5 text-xs',
              nearby ? 'text-success-ink' : 'text-ink-faint',
            )}
          >
            <Navigation size={13} aria-hidden className="shrink-0" />
            {nearby
              ? 'Вы рядом — ваш голос получит повышенный вес'
              : 'Голос весит больше, если вы находитесь рядом с местом (до 300 м)'}
          </p>
        </div>
      )}
    </section>
  );
}
