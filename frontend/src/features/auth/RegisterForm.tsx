import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { RefreshCw, Sprout } from 'lucide-react';
import { useForm } from 'react-hook-form';

import { authApi, queryKeys } from '@/shared/api';
import { Banner, Button, Field, IconButton, Input, Skeleton } from '@/shared/ui';

import { registerSchema, type RegisterValues } from './schemas';
import { applyServerErrors } from '@/shared/lib/serverErrors';
import { useAuthStore } from './store';

const CAPTCHA_TTL_MS = 4 * 60_000;
const FIELDS = ['display_name', 'username', 'email', 'password', 'captcha_answer'] as const;

export function RegisterForm() {
  const setSession = useAuthStore((state) => state.setSession);
  const captcha = useQuery({
    queryKey: queryKeys.auth.captcha,
    queryFn: authApi.captcha,
    staleTime: CAPTCHA_TTL_MS,
    gcTime: 0,
    refetchInterval: CAPTCHA_TTL_MS,
  });

  const {
    register,
    handleSubmit,
    setError,
    resetField,
    formState: { errors },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      display_name: '',
      username: '',
      email: '',
      password: '',
      captcha_answer: '',
      website: '',
    },
  });

  const refreshCaptcha = () => {
    resetField('captcha_answer');
    void captcha.refetch();
  };

  const signUp = useMutation({
    mutationFn: (values: RegisterValues) =>
      authApi.register({ ...values, captcha_token: captcha.data?.token ?? '' }),
    onSuccess: (session) => setSession(session, { onboarding: true }),
    onError: (error) => {
      applyServerErrors(error, setError, FIELDS);
      refreshCaptcha();
    },
  });

  return (
    <form
      noValidate
      onSubmit={handleSubmit((values) => signUp.mutate(values))}
      className="flex flex-col gap-4"
    >
      {errors.root && <Banner tone="danger">{errors.root.message}</Banner>}
      <Field label="Как вас зовут" htmlFor="reg-name" error={errors.display_name?.message}>
        <Input
          id="reg-name"
          autoComplete="name"
          placeholder="Аня Приморская"
          invalid={Boolean(errors.display_name)}
          data-autofocus
          {...register('display_name')}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Логин" htmlFor="reg-username" error={errors.username?.message}>
          <Input
            id="reg-username"
            autoComplete="username"
            autoCapitalize="none"
            placeholder="anya_vl"
            invalid={Boolean(errors.username)}
            {...register('username')}
          />
        </Field>
        <Field label="E-mail" htmlFor="reg-email" error={errors.email?.message}>
          <Input
            id="reg-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.ru"
            invalid={Boolean(errors.email)}
            {...register('email')}
          />
        </Field>
      </div>
      <Field
        label="Пароль"
        htmlFor="reg-password"
        hint="Не короче 8 символов"
        error={errors.password?.message}
      >
        <Input
          id="reg-password"
          type="password"
          autoComplete="new-password"
          invalid={Boolean(errors.password)}
          {...register('password')}
        />
      </Field>

      <Field
        label="Проверка, что вы человек"
        htmlFor="reg-captcha"
        error={
          errors.captcha_answer?.message ??
          (captcha.isError ? 'Не удалось загрузить вопрос' : undefined)
        }
      >
        <div className="flex items-center gap-2">
          <div className="flex h-11 min-w-0 flex-1 items-center rounded-control bg-canvas px-3.5 text-sm font-medium text-ink">
            {captcha.data ? captcha.data.question : <Skeleton className="h-4 w-36" />}
          </div>
          <div className="w-24 shrink-0">
            <Input
              id="reg-captcha"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Ответ"
              invalid={Boolean(errors.captcha_answer)}
              {...register('captcha_answer')}
            />
          </div>
          <IconButton icon={RefreshCw} label="Другой вопрос" onClick={refreshCaptcha} />
        </div>
      </Field>

      <div aria-hidden className="absolute -left-[9999px] size-px overflow-hidden">
        <label>
          Сайт
          <input type="text" tabIndex={-1} autoComplete="off" {...register('website')} />
        </label>
      </div>

      <Banner tone="infrastructure" icon={Sprout}>
        Первые публикации новичка проходят проверку модератором. Подтверждайте места других жителей
        — с 10 баллами репутации вы начнёте публиковать сразу.
      </Banner>

      <Button type="submit" size="lg" block loading={signUp.isPending} disabled={!captcha.data}>
        Создать аккаунт
      </Button>
    </form>
  );
}
