import { Navigate, useLocation } from 'react-router';

import { PROBLEMS_MODE_PARAM } from './useProblemsMode';

/**
 * The former «Отключения» section (`/outages`) now lives in «Проблемы»: old links and
 * bookmarks land there with outages selected, keeping their parameters (`?resource=heat`,
 * `?place=<id>`).
 */
export function OutagesRedirect() {
  const { search, hash } = useLocation();
  const params = new URLSearchParams(search);
  params.set(PROBLEMS_MODE_PARAM, 'outages');
  return <Navigate replace to={{ pathname: '/problems', search: `?${params}`, hash }} />;
}
