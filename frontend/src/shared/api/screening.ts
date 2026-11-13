import type { QueryKey } from '@tanstack/react-query';

import { queryClient } from './queryClient';
import { queryKeys } from './queryKeys';

/**
 * When the automatic check of something just published has normally answered (SPEC §24.1):
 * a few seconds, at most about twenty.
 */
const REREAD_AFTER_MS = [1_500, 5_000, 12_000, 24_000];

/**
 * Re-reads what was just published once the automatic check has had time to answer, so an
 * item that did not pass switches to «на проверке» with its reasons and the notice shows up.
 * The timers outlive the component that started them on purpose: editors close right after
 * publishing, and the card that opens instead shows the result.
 */
export function rereadAfterCheck(keys: QueryKey[]): void {
  for (const delay of REREAD_AFTER_MS) {
    window.setTimeout(() => {
      for (const queryKey of [...keys, queryKeys.notifications.all])
        void queryClient.invalidateQueries({ queryKey });
    }, delay);
  }
}
