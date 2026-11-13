import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Lock, Mail } from 'lucide-react';
import { useForm } from 'react-hook-form';

import { authApi } from '@/shared/api';
import { Banner, Button, Field, Input } from '@/shared/ui';

import { DemoAccounts } from './DemoAccounts';
import { loginSchema, type LoginValues } from './schemas';
import { applyServerErrors } from '@/shared/lib/serverErrors';
import { useAuthStore } from './store';

export function LoginForm() {
  const setSession = useAuthStore((state) => state.setSession);
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const login = useMutation({
    mutationFn: authApi.login,
    onSuccess: (session) => setSession(session),
    onError: (error) => applyServerErrors(error, setError, ['email', 'password']),
  });

  const fillDemo = (email: string, password: string) => {
    setValue('email', email, { shouldValidate: true });
    setValue('password', password, { shouldValidate: true });
  };

  return (
    <form
      noValidate
      onSubmit={handleSubmit((values) => login.mutate(values))}
      className="flex flex-col gap-4"
    >
      {errors.root && <Banner tone="danger">{errors.root.message}</Banner>}
      <Field label="E-mail" htmlFor="login-email" error={errors.email?.message}>
        <Input
          id="login-email"
          type="email"
          icon={Mail}
          autoComplete="email"
          placeholder="you@example.ru"
          invalid={Boolean(errors.email)}
          data-autofocus
          {...register('email')}
        />
      </Field>
      <Field label="Пароль" htmlFor="login-password" error={errors.password?.message}>
        <Input
          id="login-password"
          type="password"
          icon={Lock}
          autoComplete="current-password"
          placeholder="••••••••"
          invalid={Boolean(errors.password)}
          {...register('password')}
        />
      </Field>
      <Button type="submit" size="lg" block loading={login.isPending}>
        Войти
      </Button>
      <DemoAccounts onPick={fillDemo} />
    </form>
  );
}
