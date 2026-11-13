import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import { useAuth } from '@/features/auth';
import { errorMessage, interestsApi, queryKeys, type TopicSlug } from '@/shared/api';
import { useDebouncedValue } from '@/shared/hooks';
import { toast } from '@/shared/ui';

import { useLocalInterests } from './localStore';
import { isTopicSlug, orderTopics, TOPIC_META, TOPIC_SLUGS, type TopicMeta } from './topics';

const PROFILE_STALE_MS = 5 * 60_000;

/**
 * The topic catalogue in display order: labels and descriptions from `GET /interests/topics`
 * over the built-in ones. `available` is `false` when the server does not know topics at all
 * (an older backend) — the interest features then stay out of the way.
 */
export function useTopicCatalog() {
  const query = useQuery({
    queryKey: queryKeys.interests.topics,
    queryFn: interestsApi.topics,
    staleTime: Infinity,
    retry: false,
  });
  const topics = useMemo<TopicMeta[]>(() => {
    const served = new Map(
      (query.data ?? []).filter((topic) => isTopicSlug(topic.slug)).map((t) => [t.slug, t]),
    );
    return TOPIC_SLUGS.map((slug) => {
      const topic = served.get(slug);
      return {
        ...TOPIC_META[slug],
        ...(topic?.label && { label: topic.label }),
        ...(topic?.description && { description: topic.description }),
      };
    });
  }, [query.data]);
  return { topics, available: !query.isError };
}

/** The signed-in person's profile (`GET /me/interests`); disabled for visitors. */
export function useMyInterests() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: queryKeys.me.interests,
    queryFn: interestsApi.mine,
    enabled: isAuthenticated,
    staleTime: PROFILE_STALE_MS,
    retry: false,
  });
}

export interface Personalization {
  /**
   * Changes whenever the profile the server personalises for changes — put it into the
   * query key of anything that carries personal data (`personal_interest`, recommendations).
   */
  key: string;
  /** csv for the `topics` parameter; `undefined` for a signed-in person with a profile. */
  topics: string | undefined;
  /** `false` while a signed-in person's profile is loading — hold personal requests. */
  ready: boolean;
}

/**
 * The profile the app personalises for. A signed-in person with chosen or noticed topics is
 * known to the server; otherwise the topics picked in this browser are sent as `topics`.
 */
export function usePersonalization(): Personalization {
  const { isAuthenticated } = useAuth();
  const mine = useMyInterests();
  const local = useLocalInterests((state) => state.topics);
  const account = isAuthenticated ? mine.data : undefined;

  if (account && (account.topics.length > 0 || account.noticed.length > 0)) {
    return {
      key: `me:${account.topics.join(',')}|${account.noticed.join(',')}`,
      topics: undefined,
      ready: true,
    };
  }
  const csv = local.join(',');
  return {
    key: `${isAuthenticated ? 'me' : 'guest'}:${csv}`,
    topics: csv || undefined,
    ready: !isAuthenticated || !mine.isPending,
  };
}

/** Saves the chosen topics: to the account when signed in, to this browser otherwise. */
export function useSaveInterests() {
  const { isAuthenticated } = useAuth();
  const setLocal = useLocalInterests((state) => state.setTopics);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (topics: readonly TopicSlug[]) => {
      const ordered = orderTopics(topics);
      if (!isAuthenticated) {
        setLocal(ordered);
        return null;
      }
      return interestsApi.save({ topics: ordered });
    },
    onSuccess: (saved) => {
      if (saved) queryClient.setQueryData(queryKeys.me.interests, saved);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

/** «Забыть замеченное» — drops everything learned from behaviour. */
export function useForgetNoticed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: interestsApi.forgetNoticed,
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.me.interests, saved);
      toast.success('Забыли — подборки снова только по вашему выбору');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

/** The query must stay unchanged this long before it counts as a search. */
const SIGNAL_SETTLE_MS = 1500;
const SIGNAL_MIN_LENGTH = 3;
const SIGNAL_MAX_LENGTH = 100;
/** Texts already reported in this tab (lower-cased) — one signal per query. */
const reported = new Set<string>();

/**
 * Reports a settled search of a signed-in person (`POST /me/interests/signals`): only after
 * the text has stopped changing, ≥ 3 characters, once per text; failures are ignored.
 */
export function useSearchSignal(text: string): void {
  const { isAuthenticated } = useAuth();
  const settled = useDebouncedValue(text.trim().replace(/\s+/g, ' '), SIGNAL_SETTLE_MS);

  useEffect(() => {
    const q = settled.slice(0, SIGNAL_MAX_LENGTH);
    const seen = q.toLowerCase();
    if (!isAuthenticated || q.length < SIGNAL_MIN_LENGTH || reported.has(seen)) return;
    reported.add(seen);
    interestsApi.signal({ kind: 'search', q }).catch(() => undefined);
  }, [isAuthenticated, settled]);
}
