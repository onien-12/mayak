import { useAuthStore } from './store';

/**
 * Runs `action` for a signed-in user; for an anonymous one opens the auth modal and
 * resumes `action` right after a successful login or registration.
 *
 * @param reason Short continuation of «Войдите, …», e.g. «чтобы подтвердить место».
 */
export function requireAuth(action: () => void, reason?: string): void {
  const { token, openModal } = useAuthStore.getState();
  if (token) {
    action();
    return;
  }
  openModal('login', action, reason);
}

export function openAuthModal(mode: 'login' | 'register' = 'login'): void {
  useAuthStore.getState().openModal(mode);
}
