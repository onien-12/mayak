import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { interestsApi, queryKeys, type RecommendationsQuery } from '@/shared/api';

import { usePersonalization } from './useInterests';

/**
 * «Для вас» for the current profile (`GET /recommendations`). Keeps the previous answer while
 * the map moves or the profile changes; an error (e.g. an older backend) is simply no block.
 */
export function useRecommendations(
  query: Omit<RecommendationsQuery, 'topics'>,
  { enabled = true }: { enabled?: boolean } = {},
) {
  const { key, topics, ready } = usePersonalization();
  const params: RecommendationsQuery = { ...query, topics };
  return useQuery({
    queryKey: queryKeys.interests.recommendations(params, key),
    queryFn: ({ signal }) => interestsApi.recommendations(params, signal),
    enabled: enabled && ready,
    placeholderData: keepPreviousData,
    retry: false,
  });
}
