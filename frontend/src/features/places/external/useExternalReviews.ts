import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { ApiError } from '@/shared/api';

import {
  externalReviewsKey,
  externalSummaryKey,
  fetchExternalReviews,
  fetchMoreReviews,
  sourcePhotos,
  type ExternalReviews,
  type ExternalReviewSource,
  type ExternalReviewsTarget,
  type ReviewSourceName,
} from './api';

const HOUR = 60 * 60 * 1000;
const ONCE = {
  staleTime: Infinity,
  gcTime: 12 * HOUR,
  retry: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
} as const;
const NO_TARGET = ['experimental', 'external-reviews', 'none'] as const;

/**
 * Every cache miss is a real request to the source: fetch once per session, never retry. The
 * answer also feeds the summary row and the photo fallback of the same card. `null` target —
 * the object is not looked up at the sources at all.
 */
export function useExternalReviews(target: ExternalReviewsTarget | null, enabled: boolean) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: target ? externalReviewsKey(target) : NO_TARGET,
    queryFn:
      target && enabled
        ? async () => {
            const reviews = await fetchExternalReviews(target);
            queryClient.setQueryData(externalSummaryKey(target), reviews);
            return reviews;
          }
        : skipToken,
    ...ONCE,
    refetchInterval: (query) => (query.state.data?.pending ? 2000 : false),
  });
}

/** What the server already knows about the target — never makes it ask the source. */
export function useExternalSummary(target: ExternalReviewsTarget | null, enabled = true) {
  return useQuery({
    queryKey: target ? externalSummaryKey(target) : [...NO_TARGET, 'cached'],
    queryFn: target && enabled ? () => fetchExternalReviews(target, true) : skipToken,
    ...ONCE,
  });
}

/** Hot-linked photos of the matched organisations, credited per service; [] while unknown. */
export function useExternalPhotos(target: ExternalReviewsTarget, enabled: boolean) {
  const { data } = useExternalSummary(target, enabled);
  return sourcePhotos(data);
}

interface MoreInput {
  target: ExternalReviewsTarget;
  source: ReviewSourceName;
}

/**
 * «Загрузить ещё»: the next page of one source, merged into both cached answers of the card.
 * A real request to the source — only on a press, never retried; 409 means it has no more.
 */
export function useMoreReviews() {
  const queryClient = useQueryClient();
  const merge = (
    { target, source }: MoreInput,
    update: (entry: ExternalReviewSource) => ExternalReviewSource,
  ) => {
    for (const key of [externalReviewsKey(target), externalSummaryKey(target)]) {
      queryClient.setQueryData<ExternalReviews>(
        key,
        (data) =>
          data && {
            ...data,
            sources: data.sources.map((entry) => (entry.source === source ? update(entry) : entry)),
          },
      );
    }
  };

  return useMutation({
    mutationFn: ({ target, source }: MoreInput) => fetchMoreReviews(target, source),
    retry: false,
    onSuccess: (entry, input) => {
      const valid = entry.source === input.source && Array.isArray(entry.reviews);
      merge(input, (current) => (valid ? entry : { ...current, has_more: false }));
    },
    onError: (error, input) => {
      if (error instanceof ApiError && error.status === 409) {
        merge(input, (current) => ({ ...current, has_more: false }));
      }
    },
  });
}

/** True once the element came near the viewport (immediately when `lazy` is off). */
export function useInView<T extends Element>(lazy: boolean) {
  const [node, setNode] = useState<T | null>(null);
  const [inView, setInView] = useState(!lazy);

  useEffect(() => {
    if (!node || inView) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setInView(true);
      },
      { rootMargin: '200px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, inView]);

  return [setNode, inView] as const;
}
