import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { requireAuth, useAuth } from '@/features/auth';
import { errorMessage, placesApi, queryKeys, type PlaceDetail, type Review } from '@/shared/api';
import { formatRating, pluralize, PLURALS } from '@/shared/lib/format';
import { shownRating } from '@/shared/lib/rating';
import {
  Button,
  ErrorState,
  RatingInput,
  RatingStars,
  Skeleton,
  Textarea,
  toast,
} from '@/shared/ui';

import { externalTarget, isExternalReviewsTarget } from '../external/api';
import { ReviewFeed } from '../external/ReviewFeed';

const MAX_TEXT = 2000;

function ReviewForm({ place, mine }: { place: PlaceDetail; mine: Review | undefined }) {
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(mine?.rating ?? place.my_rating ?? 0);
  const [text, setText] = useState(mine?.text ?? '');

  const save = useMutation({
    mutationFn: () => placesApi.saveReview(place.id, { rating, text: text.trim() }),
    onSuccess: () => {
      toast.success(mine ? 'Отзыв обновлён' : 'Спасибо за отзыв!');
      void queryClient.invalidateQueries({ queryKey: queryKeys.places.reviews(place.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.places.detail(place.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.places.lists });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        requireAuth(() => save.mutate(), 'чтобы оставить отзыв');
      }}
      className="flex flex-col gap-2 rounded-card border border-line bg-surface p-3.5"
    >
      <p className="text-sm font-semibold text-ink">{mine ? 'Ваш отзыв' : 'Как вам это место?'}</p>
      <RatingInput value={rating} onChange={setRating} />
      {rating > 0 && (
        <>
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={MAX_TEXT}
            rows={3}
            placeholder="Расскажите о впечатлениях — это поможет другим"
            aria-label="Текст отзыва"
          />
          <Button type="submit" loading={save.isPending} className="self-end">
            {mine ? 'Сохранить' : 'Отправить отзыв'}
          </Button>
        </>
      )}
    </form>
  );
}

/** The big number on top: the combined rating when there is one, otherwise ours. */
function RatingHeader({ place }: { place: PlaceDetail }) {
  const shown = shownRating(place);
  if (!shown) return null;
  const caption = shown.combined
    ? ['Оценка по Маяку и картам', shown.count !== null && pluralize(shown.count, PLURALS.rating)]
    : [pluralize(place.rating_count, PLURALS.review), 'личные впечатления жителей'];
  return (
    <div className="flex items-center gap-3">
      <span className="font-display text-3xl font-semibold text-ink">
        {formatRating(shown.value)}
      </span>
      <div>
        <RatingStars value={shown.value} size={16} />
        <p className="text-xs text-ink-faint">{caption.filter(Boolean).join(' · ')}</p>
      </div>
    </div>
  );
}

/**
 * Subjective impressions: the rating, own review (upsert) and one list of reviews — ours and
 * the other services' mixed, each marked with where it came from.
 */
export function ReviewsTab({ place }: { place: PlaceDetail }) {
  const { user } = useAuth();
  const reviews = useQuery({
    queryKey: queryKeys.places.reviews(place.id),
    queryFn: () => placesApi.reviews(place.id),
  });

  if (reviews.isPending) return <Skeleton className="h-28 rounded-card" />;
  if (reviews.isError)
    return <ErrorState error={reviews.error} onRetry={() => void reviews.refetch()} />;

  const mine = reviews.data.find((review) => review.author.id === user?.id);
  const own = user?.id === place.author_id;

  return (
    <div className="flex flex-col gap-3">
      <RatingHeader place={place} />
      {!own && <ReviewForm key={mine?.id ?? 'new'} place={place} mine={mine} />}
      <ReviewFeed
        target={isExternalReviewsTarget(place) ? externalTarget('place', place) : null}
        own={{ reviews: reviews.data, rating: place.rating_avg }}
        currentUserId={user?.id}
        emptyHint={
          own ? 'Здесь появятся впечатления других жителей.' : 'Поделитесь впечатлением первым.'
        }
      />
    </div>
  );
}
