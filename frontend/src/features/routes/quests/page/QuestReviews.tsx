import { MessageSquareHeart } from 'lucide-react';
import { useState } from 'react';

import { useAuth } from '@/features/auth';
import type { QuestDetail, Review } from '@/shared/api';
import { formatRelative, pluralize, PLURALS } from '@/shared/lib/format';
import {
  Button,
  EmptyState,
  ErrorState,
  OnReviewMark,
  RatingInput,
  RatingStars,
  Skeleton,
  Textarea,
  UserChip,
} from '@/shared/ui';

import { useQuestReviews, useSaveQuestReview } from '../useQuests';

const MAX_TEXT = 2000;

function ReviewForm({ quest, mine }: { quest: QuestDetail; mine: Review | undefined }) {
  const [rating, setRating] = useState(mine?.rating ?? quest.my_rating ?? 0);
  const [text, setText] = useState(mine?.text ?? '');
  const save = useSaveQuestReview(quest.id, Boolean(mine));

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate({ rating, text: text.trim() });
      }}
      className="flex flex-col gap-2 rounded-card border border-line bg-surface p-3.5"
    >
      <p className="text-sm font-semibold text-ink">
        {mine ? 'Ваша оценка' : 'Вы прошли квест — оцените его'}
      </p>
      <RatingInput value={rating} onChange={setRating} />
      {rating > 0 && (
        <div className="flex animate-fade-in flex-col gap-2">
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={MAX_TEXT}
            rows={3}
            placeholder="Какие загадки понравились, где было сложно — без разгадок, пожалуйста"
            aria-label="Текст отзыва"
          />
          <Button type="submit" loading={save.isPending} className="self-end">
            {mine ? 'Сохранить' : 'Отправить'}
          </Button>
        </div>
      )}
    </form>
  );
}

/** Ratings of those who finished the quest; only they may rate it. */
export function QuestReviews({ quest }: { quest: QuestDetail }) {
  const { user } = useAuth();
  const reviews = useQuestReviews(quest.id);
  const mine = reviews.data?.find((review) => review.author.id === user?.id);
  const canRate = quest.has_finished && quest.author.id !== user?.id;

  return (
    <section aria-labelledby="quest-reviews" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="quest-reviews" className="font-display text-base font-semibold text-ink">
          Отзывы
        </h2>
        {quest.rating_avg !== null && quest.rating_count > 0 && (
          <span className="flex items-center gap-1.5 text-sm text-ink-soft">
            <RatingStars value={quest.rating_avg} />
            <span className="font-semibold text-ink">
              {quest.rating_avg.toFixed(1).replace('.', ',')}
            </span>
            · {pluralize(quest.rating_count, PLURALS.rating)}
          </span>
        )}
      </div>
      {reviews.isPending && <Skeleton className="h-20 rounded-card" />}
      {reviews.isError && (
        <ErrorState error={reviews.error} onRetry={() => void reviews.refetch()} />
      )}
      {reviews.data && (
        <>
          {canRate && <ReviewForm key={mine?.id ?? 'new'} quest={quest} mine={mine} />}
          {reviews.data.length === 0 ? (
            <EmptyState
              icon={MessageSquareHeart}
              title="Отзывов пока нет"
              description="Оценить квест могут те, кто прошёл его до конца."
              className="py-4"
            />
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {reviews.data.map((review) => (
                <li key={review.id} className="py-3">
                  <div className="flex items-center justify-between gap-2">
                    <UserChip
                      user={review.author}
                      size="sm"
                      showLevel={false}
                      caption={formatRelative(review.created_at)}
                    />
                    <RatingStars value={review.rating} />
                  </div>
                  {review.text && (
                    <p className="mt-2 text-sm whitespace-pre-line text-ink">{review.text}</p>
                  )}
                  {review.on_review && <OnReviewMark className="mt-2" />}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
