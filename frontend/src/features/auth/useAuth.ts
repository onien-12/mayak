import { useQuery } from '@tanstack/react-query';

import { authApi, queryKeys, type UserMe, type UserPermissions } from '@/shared/api';

import { useAuthStore } from './store';

const ME_POLL_MS = 60_000;

interface AuthInfo {
  /** `null` for anonymous visitors and while the profile is loading. */
  user: UserMe | null;
  isAuthenticated: boolean;
  /** True while a stored token is being exchanged for the profile. */
  isLoading: boolean;
  permissions: UserPermissions | null;
  isModerator: boolean;
  logout: () => void;
}

/**
 * Current user. `/auth/me` is polled every 60 s — it also carries `unread_notifications`.
 */
export function useAuth(): AuthInfo {
  const token = useAuthStore((state) => state.token);
  const logout = useAuthStore((state) => state.logout);

  const query = useQuery({
    queryKey: queryKeys.auth.me,
    queryFn: authApi.me,
    enabled: token !== null,
    refetchInterval: ME_POLL_MS,
    refetchOnWindowFocus: true,
  });

  const user = token !== null ? (query.data ?? null) : null;

  return {
    user,
    isAuthenticated: token !== null,
    isLoading: token !== null && query.isPending,
    permissions: user?.permissions ?? null,
    isModerator: user?.permissions.can_moderate ?? false,
    logout,
  };
}
