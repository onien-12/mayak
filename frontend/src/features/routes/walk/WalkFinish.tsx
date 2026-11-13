import { Heart, RotateCcw } from 'lucide-react';

import { requireAuth, useAuth } from '@/features/auth';
import type { RouteDetail } from '@/shared/api';
import { formatDistance, pluralize } from '@/shared/lib/format';
import { Button, Rise, SuccessCheck } from '@/shared/ui';

import { ROUTE_PLURALS } from '../lib/plurals';
import { ReviewForm } from '../page/RouteReviews';
import { useRouteReviews, useSaveRoute } from '../useRoute';

interface WalkFinishProps {
  route: RouteDetail;
  onRestart: () => void;
  onClose: () => void;
}

/** «Маршрут пройден»: a calm success moment, then rate and save prompts. */
export function WalkFinish({ route, onRestart, onClose }: WalkFinishProps) {
  const { user } = useAuth();
  const own = user?.id === route.author.id;
  const isPublic =
    route.visibility === 'public' && route.status !== 'pending' && route.status !== 'hidden';
  const reviews = useRouteReviews(route.id, isPublic && !own);
  const save = useSaveRoute(route.id);
  const mine = reviews.data?.find((review) => review.author.id === user?.id);

  return (
    <div className="flex flex-col items-center gap-5 pt-4 pb-2 text-center">
      <SuccessCheck size={104} />
      <Rise delay={0.3} className="flex flex-col items-center gap-1.5">
        <h2 className="font-display text-2xl font-semibold text-ink">Маршрут пройден!</h2>
        <p className="max-w-xs text-sm text-ink-soft">
          {formatDistance(route.distance_m)} и {pluralize(route.stops_count, ROUTE_PLURALS.point)}{' '}
          позади. Спасибо, что гуляете по Владивостоку с «Маяком».
        </p>
      </Rise>
      <Rise delay={0.45} className="flex w-full flex-col gap-3 text-left">
        {isPublic && !own && reviews.data && (
          <ReviewForm key={mine?.id ?? 'new'} route={route} mine={mine} />
        )}
        <div className="flex gap-2">
          {isPublic && !route.is_saved && (
            <Button
              variant="secondary"
              icon={Heart}
              className="flex-1"
              onClick={() => requireAuth(() => save.mutate(true), 'чтобы сохранить маршрут себе')}
            >
              Сохранить себе
            </Button>
          )}
          <Button variant="ghost" icon={RotateCcw} className="flex-1" onClick={onRestart}>
            Пройти заново
          </Button>
        </div>
        <Button block onClick={onClose}>
          Вернуться к маршруту
        </Button>
      </Rise>
    </div>
  );
}
