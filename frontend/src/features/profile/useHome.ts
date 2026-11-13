import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/features/auth';
import { ApiError, errorMessage, queryKeys, usersApi, type UserMe } from '@/shared/api';
import { useReverseGeocode } from '@/shared/hooks';
import type { LatLng } from '@/shared/lib/geo';
import { toast } from '@/shared/ui';

const LABEL_MAX = 120;

/** The signed-in user's home point, or `null` (anonymous / not set). */
export function useHomeArea(): LatLng | null {
  const { user } = useAuth();
  const lat = user?.home?.lat;
  const lng = user?.home?.lng;
  return useMemo(() => (lat !== undefined && lng !== undefined ? { lat, lng } : null), [lat, lng]);
}

/** Whether the home can be changed now (first setting is free, then once per 30 days). */
export function homeChangeDate(me: UserMe): Date | null {
  const at = me.home?.can_change_at;
  if (!at) return null;
  const date = new Date(at);
  return date.getTime() > Date.now() ? date : null;
}

function syncMe(queryClient: ReturnType<typeof useQueryClient>, me: UserMe) {
  queryClient.setQueryData(queryKeys.auth.me, me);
  void queryClient.invalidateQueries({ queryKey: queryKeys.me.subscriptions });
}

/**
 * Saves the home area. The picked point is labelled with one cached reverse-geocoding
 * lookup (district / street) before it is sent; without 2GIS the label is simply omitted.
 */
export function useSaveHome(onSaved: () => void) {
  const queryClient = useQueryClient();
  const [point, setPoint] = useState<LatLng | null>(null);
  const geocode = useReverseGeocode(point, 'area');

  const save = useMutation({
    mutationFn: (input: LatLng & { label?: string }) => usersApi.setHome(input),
    onSuccess: (me) => {
      syncMe(queryClient, me);
      toast.success('Мой район сохранён');
      onSaved();
    },
    onError: (error) => {
      const cooldown = error instanceof ApiError && error.code === 'home_cooldown';
      toast.error(cooldown ? error.detail : errorMessage(error));
    },
    onSettled: () => setPoint(null),
  });

  const labelReady = point !== null && !geocode.isLoading;
  const { mutate, isIdle } = save;
  const label = geocode.data?.slice(0, LABEL_MAX) || undefined;
  useEffect(() => {
    if (point && labelReady && isIdle) mutate({ lat: point.lat, lng: point.lng, label });
  }, [point, labelReady, isIdle, mutate, label]);

  return {
    start: (target: LatLng) => {
      save.reset();
      setPoint(target);
    },
    isSaving: point !== null || save.isPending,
  };
}

export function useRemoveHome() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: usersApi.removeHome,
    onSuccess: (me) => {
      syncMe(queryClient, me);
      toast.success('Район удалён');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}
