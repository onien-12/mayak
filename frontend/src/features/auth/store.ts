import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { configureApiAuth, queryClient, queryKeys, type AuthResponse } from '@/shared/api';
import { toast } from '@/shared/ui';

export type AuthModalMode = 'login' | 'register';

interface AuthState {
  token: string | null;
  modal: AuthModalMode | null;
  /** Why the modal was opened («чтобы подтвердить место») — shown under the title. */
  reason: string | null;
  /** Action to resume right after a successful sign-in. */
  pendingAction: (() => void) | null;
  /** A new account was just created: the onboarding step runs before `pendingAction`. */
  onboarding: boolean;
  openModal: (mode?: AuthModalMode, pendingAction?: () => void, reason?: string) => void;
  switchMode: (mode: AuthModalMode) => void;
  closeModal: () => void;
  setSession: (session: AuthResponse, options?: { onboarding?: boolean }) => void;
  /** Ends the onboarding step and resumes the pending action. */
  finishOnboarding: () => void;
  logout: () => void;
}

function refreshPersonalData(): void {
  void queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] !== 'auth' });
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      modal: null,
      reason: null,
      pendingAction: null,
      onboarding: false,

      openModal: (mode = 'login', pendingAction, reason) =>
        set({ modal: mode, pendingAction: pendingAction ?? null, reason: reason ?? null }),
      switchMode: (mode) => set({ modal: mode }),
      closeModal: () => set({ modal: null, pendingAction: null, reason: null }),

      setSession: (session, { onboarding = false } = {}) => {
        const { pendingAction } = get();
        set({
          token: session.access_token,
          modal: null,
          reason: null,
          onboarding,
          pendingAction: onboarding ? pendingAction : null,
        });
        queryClient.setQueryData(queryKeys.auth.me, session.user);
        refreshPersonalData();
        if (!onboarding) pendingAction?.();
      },

      finishOnboarding: () => {
        const { pendingAction } = get();
        set({ onboarding: false, pendingAction: null });
        pendingAction?.();
      },

      logout: () => {
        set({ token: null, onboarding: false, pendingAction: null });
        queryClient.removeQueries({ queryKey: queryKeys.auth.me });
        queryClient.removeQueries({ queryKey: queryKeys.me.all });
        queryClient.removeQueries({ queryKey: queryKeys.notifications.all });
        queryClient.removeQueries({ queryKey: queryKeys.moderation.all });
        refreshPersonalData();
      },
    }),
    {
      name: 'mayak-auth',
      partialize: (state) => ({ token: state.token }),
    },
  ),
);

configureApiAuth({
  getToken: () => useAuthStore.getState().token,
  onUnauthorized: () => {
    useAuthStore.getState().logout();
    toast.info('Сессия истекла — войдите снова');
  },
});
