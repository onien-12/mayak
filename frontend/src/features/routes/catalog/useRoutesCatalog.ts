import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { useAuth } from '@/features/auth';
import { queryKeys, routesApi, type RouteCard, type RoutesQuery } from '@/shared/api';
import { useDebouncedValue } from '@/shared/hooks';

import { useCatalogFilters } from './catalogStore';

const SEARCH_DEBOUNCE_MS = 350;
const MIN_SEARCH_LENGTH = 2;

function matchesSearch(route: RouteCard, search: string): boolean {
  const haystack = [route.title, route.description, ...route.tags].join(' ').toLowerCase();
  return haystack.includes(search.toLowerCase());
}

/**
 * Routes for the catalog: public routes filtered on the server, or the user's own routes
 * (`/me/routes`, every status) filtered locally by the same chips.
 */
export function useRoutesCatalog() {
  const { isAuthenticated } = useAuth();
  const filters = useCatalogFilters();
  const typed = useDebouncedValue(filters.search.trim(), SEARCH_DEBOUNCE_MS);
  const search = typed.length >= MIN_SEARCH_LENGTH ? typed : '';
  const mine = filters.scope === 'mine' && isAuthenticated;

  const params: RoutesQuery = {
    kind: filters.kinds.length > 0 ? filters.kinds : undefined,
    difficulty: filters.difficulties.length > 0 ? filters.difficulties : undefined,
    q: search || undefined,
    sort: filters.sort,
  };

  const publicRoutes = useQuery({
    queryKey: queryKeys.routes.list(params),
    queryFn: ({ signal }) => routesApi.list(params, signal),
    enabled: !mine,
    placeholderData: keepPreviousData,
  });

  const ownRoutes = useQuery({
    queryKey: queryKeys.routes.mine,
    queryFn: routesApi.mine,
    enabled: mine,
    select: (routes) =>
      routes.filter(
        (route) =>
          (filters.kinds.length === 0 || filters.kinds.includes(route.kind)) &&
          (filters.difficulties.length === 0 ||
            (route.difficulty !== null && filters.difficulties.includes(route.difficulty))) &&
          (!search || matchesSearch(route, search)),
      ),
  });

  const query = mine ? ownRoutes : publicRoutes;
  return {
    routes: query.data,
    mine,
    isPending: query.isPending,
    isRefreshing: query.isFetching && !query.isPending,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
