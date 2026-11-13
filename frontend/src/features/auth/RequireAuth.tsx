import { Lock, ShieldX } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button, EmptyState, Spinner } from '@/shared/ui';

import { openAuthModal } from './requireAuth';
import { useAuth } from './useAuth';

interface RequireAuthProps {
  /** Additionally require the moderator / admin role. */
  moderator?: boolean;
  /** What the visitor gets after signing in («чтобы увидеть профиль»). */
  reason?: string;
  children: ReactNode;
}

/** Route guard: renders children for signed-in users, a sign-in prompt otherwise. */
export function RequireAuth({ moderator = false, reason, children }: RequireAuthProps) {
  const { isAuthenticated, isLoading, isModerator } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size={24} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <EmptyState
        icon={Lock}
        title="Нужен вход"
        description={`Войдите в аккаунт${reason ? `, ${reason}` : ''}.`}
        action={<Button onClick={() => openAuthModal('login')}>Войти</Button>}
        className="h-full justify-center"
      />
    );
  }

  if (moderator && !isModerator) {
    return (
      <EmptyState
        icon={ShieldX}
        title="Раздел для модераторов"
        description="У вашего аккаунта нет доступа к панели модерации."
        className="h-full justify-center"
      />
    );
  }

  return children;
}
