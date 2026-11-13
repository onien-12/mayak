import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { catalogApi, queryKeys, type Category, type Layer } from '../api';

const CATALOG_STALE_MS = 30 * 60_000;

/** The whole category catalog (cached for the session) with lookup helpers. */
export function useCategories() {
  const query = useQuery({
    queryKey: queryKeys.categories.list(),
    queryFn: () => catalogApi.categories(),
    staleTime: CATALOG_STALE_MS,
  });

  const byId = useMemo(() => {
    const map = new Map<number, Category>();
    for (const category of query.data ?? []) map.set(category.id, category);
    return map;
  }, [query.data]);

  return {
    categories: query.data ?? [],
    byId,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useLayerCategories(layers: readonly Layer[]): Category[] {
  const { categories } = useCategories();
  return useMemo(
    () => categories.filter((category) => layers.includes(category.layer)),
    [categories, layers],
  );
}
