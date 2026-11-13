import { useAuth } from '@/features/auth';
import type { UserLevel } from '@/shared/api';

const CREATOR_LEVELS: readonly UserLevel[] = ['trusted', 'expert'];

/** Areas are created by level `trusted`+ and moderators (API: 403 for everyone else). */
export function useCanManageAreas(): boolean {
  const { user, isModerator } = useAuth();
  return isModerator || (user !== null && CREATOR_LEVELS.includes(user.level));
}
