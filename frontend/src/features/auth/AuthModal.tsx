import { useEffect, type ReactNode } from 'react';

import { Modal, SegmentedControl } from '@/shared/ui';

import { LoginForm } from './LoginForm';
import { RegisterForm } from './RegisterForm';
import { useAuthStore, type AuthModalMode } from './store';

const MODES: readonly { value: AuthModalMode; label: string }[] = [
  { value: 'login', label: 'Вход' },
  { value: 'register', label: 'Регистрация' },
];

interface AuthModalProps {
  /**
   * The step right after a successful registration (the interest picker, plugged in by the
   * app shell); it calls `done` to finish — then the action that asked for an account resumes.
   */
  renderOnboarding?: (done: () => void) => ReactNode;
}

/** Login / registration dialog — mounted once in the app shell, opened via `requireAuth`. */
export function AuthModal({ renderOnboarding }: AuthModalProps) {
  const mode = useAuthStore((state) => state.modal);
  const reason = useAuthStore((state) => state.reason);
  const onboarding = useAuthStore((state) => state.onboarding);
  const switchMode = useAuthStore((state) => state.switchMode);
  const closeModal = useAuthStore((state) => state.closeModal);
  const finishOnboarding = useAuthStore((state) => state.finishOnboarding);
  const skipOnboarding = onboarding && !renderOnboarding;

  useEffect(() => {
    if (skipOnboarding) finishOnboarding();
  }, [skipOnboarding, finishOnboarding]);

  if (onboarding && renderOnboarding) return renderOnboarding(finishOnboarding);
  if (mode === null) return null;

  return (
    <Modal
      open
      onClose={closeModal}
      title={mode === 'login' ? 'С возвращением!' : 'Присоединяйтесь к «Маяку»'}
      description={
        reason
          ? `Войдите, ${reason}. Смотреть карту можно и без аккаунта.`
          : 'Аккаунт нужен, чтобы добавлять и подтверждать места. Смотреть карту можно без него.'
      }
    >
      <SegmentedControl
        label="Вход или регистрация"
        value={mode}
        onChange={switchMode}
        options={MODES}
        className="mb-5"
      />
      {mode === 'login' ? <LoginForm /> : <RegisterForm />}
    </Modal>
  );
}
