import { QueryClient } from '@tanstack/react-query';

import { ApiError } from './client';

const RETRYABLE_STATUS_FROM = 500;

/** App-wide query client (singleton so that non-React code, e.g. logout, can reach the cache). */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        const retryable =
          !(error instanceof ApiError) ||
          error.status === 0 ||
          error.status >= RETRYABLE_STATUS_FROM;
        return retryable && failureCount < 1;
      },
    },
  },
});
