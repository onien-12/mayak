import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

const WALK_PARAM = 'walk';

/** `?walk=1` on the route page: the «Пройти маршрут» mode (survives reloads, back button exits). */
export function useWalkParam() {
  const [searchParams, setSearchParams] = useSearchParams();
  const walking = searchParams.get(WALK_PARAM) === '1';

  const startWalk = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set(WALK_PARAM, '1');
      return next;
    });
  }, [setSearchParams]);

  const stopWalk = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete(WALK_PARAM);
      return next;
    });
  }, [setSearchParams]);

  return { walking, startWalk, stopWalk };
}
