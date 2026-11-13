import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

import type { OutageResource } from '@/shared/api';

const PARAM = 'resource';
const RESOURCES: readonly OutageResource[] = ['cold_water', 'hot_water', 'heat', 'electricity'];

const isResource = (value: string | null): value is OutageResource =>
  RESOURCES.some((resource) => resource === value);

/** Resource filter of «Проблемы» → «Отключения» in the URL (`?resource=heat`); tapping the active one clears it. */
export function useResourceFilter() {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get(PARAM);
  const resource = isResource(raw) ? raw : null;

  const toggle = useCallback(
    (next: OutageResource) =>
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (params.get(PARAM) === next) params.delete(PARAM);
          else params.set(PARAM, next);
          return params;
        },
        { replace: true },
      ),
    [setSearchParams],
  );

  return { resource, toggle };
}
