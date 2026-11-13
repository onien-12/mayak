import { MessageSquareHeart } from 'lucide-react';
import { useState } from 'react';

import { requireAuth, useAuth } from '@/features/auth';
import type { Review, RouteDetail } from '@/shared/api';
import { formatRelative, pluralize, PLURALS } from '@/shared/lib/format';
import {
  Button,
  EmptyState,
  ErrorState,
  RatingInput,
  RatingStars,
  Skeleton,
  Textarea,
  UserChip,
} from '@/shared/ui';

import { useRouteReviews, useSaveRouteReview } from '../useRoute';

const MAX_TEXT = 2000;

export function ReviewForm({ route, mine }: { route: RouteDetail; mine: Review | undefined }) {
  const [rating, setRating] = useState(mine?.rating ?? route.my_rating ?? 0);
  const [text, setText] = useState(mine?.text ?? '');
  const save = useSaveRouteReview(route.id, Boolean(mine));

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        requireAuth(() => save.mutate({ rating, text: text.trim() }), 'чтобы оценить маршрут');
      }}
      className="flex flex-col gap-2 rounded-card border border-line bg-surface p-3.5"
    >
      <p className="text-sm font-semibold text-ink">
        {mine ? 'Ваш отзыв' : 'Прошли маршрут? Оцените его'}
      </p>
      <RatingInput value={rating} onChange={setRating} />
      {rating > 0 && (
        <div className="flex animate-fade-in flex-col gap-2">
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={MAX_TEXT}
            rows={3}
            placeholder="Что понравилось, что стоит знать тем, кто пойдёт после вас"
            aria-label="Текст отзыва"
          />
          <Button type="submit" loading={save.isPending} className="self-end">
            {mine ? 'Сохранить' : 'Отправить отзыв'}
          </Button>
        </div>
      )}
    </form>
  );
}

/** Ratings and impressions of people who walked the route (public routes only). */
export function RouteReviews({ route }: { route: RouteDetail }) {
  const { user } = useAuth();
  const reviews = useRouteReviews(route.id, true);
  const own = user?.id === route.author.id;
  const mine = reviews.data?.find((review) => review.author.id === user?.id);

  return (
    <section aria-labelledby="route-reviews" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="route-reviews" className="font-display text-base font-semibold text-ink">
          Отзывы
        </h2>
        {route.rating_avg !== null && route.rating_count > 0 && (
          <span className="flex items-center gap-1.5 text-sm text-ink-soft">
            <RatingStars value={route.rating_avg} />
            <span className="font-semibold text-ink">
              {route.rating_avg.toFixed(1).replace('.', ',')}
            </span>
            · {pluralize(route.rating_count, PLURALS.review)}
          </span>
        )}
      </div>

      {reviews.isPending && <Skeleton className="h-24 rounded-card" />}
      {reviews.isError && (
        <ErrorState error={reviews.error} onRetry={() => void reviews.refetch()} />
      )}
      {reviews.data && (
        <>
          {!own && <ReviewForm key={mine?.id ?? 'new'} route={route} mine={mine} />}
          {reviews.data.length === 0 ? (
            <EmptyState
              icon={MessageSquareHeart}
              title="Отзывов пока нет"
              description={
                own
                  ? 'Здесь появятся впечатления тех, кто пройдёт ваш маршрут.'
                  : 'Пройдите маршрут и расскажите, как всё прошло.'
              }
              className="py-5"
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
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
