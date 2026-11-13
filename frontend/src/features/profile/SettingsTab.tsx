import { zodResolver } from '@hookform/resolvers/zod';
import { LogOut, Save } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';

import { useAuth } from '@/features/auth';
import { InterestsSettings } from '@/features/interests';
import type { UserMe } from '@/shared/api';
import { applyServerErrors } from '@/shared/lib/serverErrors';
import { Banner, Button, Field, Input, Textarea } from '@/shared/ui';

import { GraphicsSettings } from './GraphicsSettings';
import { HomeAreaCard } from './HomeArea';
import { useUpdateMe } from './useProfile';

const BIO_MAX = 500;

const profileSchema = z.object({
  display_name: z.string().trim().min(2, 'Минимум 2 символа').max(60, 'Не длиннее 60 символов'),
  bio: z.string().trim().max(BIO_MAX, `Не длиннее ${BIO_MAX} символов`),
});

type ProfileValues = z.infer<typeof profileSchema>;

function ProfileForm({ me }: { me: UserMe }) {
  const update = useUpdateMe();
  const {
    register,
    handleSubmit,
    setError,
    reset,
    control,
    formState: { errors, isDirty },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { display_name: me.display_name, bio: me.bio },
  });
  const bioLength = useWatch({ control, name: 'bio' }).length;

  return (
    <form
      noValidate
      onSubmit={handleSubmit((values) =>
        update.mutate(values, {
          onSuccess: (saved) => reset({ display_name: saved.display_name, bio: saved.bio }),
          onError: (error) => applyServerErrors(error, setError, ['display_name', 'bio']),
        }),
      )}
      className="flex flex-col gap-4"
    >
      {errors.root && <Banner tone="danger">{errors.root.message}</Banner>}
      <Field label="Имя на карте" htmlFor="profile-name" error={errors.display_name?.message}>
        <Input
          id="profile-name"
          autoComplete="name"
          invalid={Boolean(errors.display_name)}
          {...register('display_name')}
        />
      </Field>
      <Field
        label="О себе"
        htmlFor="profile-bio"
        optional
        error={errors.bio?.message}
        hint={`${bioLength}/${BIO_MAX} · например, в каком районе живёте и что любите в городе`}
      >
        <Textarea
          id="profile-bio"
          rows={4}
          maxLength={BIO_MAX}
          invalid={Boolean(errors.bio)}
          {...register('bio')}
        />
      </Field>
      <Button type="submit" icon={Save} loading={update.isPending} disabled={!isDirty}>
        Сохранить
      </Button>
    </form>
  );
}

/** Own profile settings: name and bio, «Мой район», «Мои интересы», «Графика», sign out. */
export function SettingsTab({ onPickHome }: { onPickHome: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;

  return (
    <div className="flex flex-col gap-6">
      <ProfileForm me={user} />
      <HomeAreaCard me={user} onPick={onPickHome} />
      <InterestsSettings />
      <GraphicsSettings />
      <div className="flex flex-col gap-2 border-t border-line pt-5">
        <p className="text-sm text-ink-soft">Вы вошли как {user.email}</p>
        <Button
          variant="secondary"
          icon={LogOut}
          onClick={() => {
            logout();
            navigate('/');
          }}
        >
          Выйти из аккаунта
        </Button>
      </div>
    </div>
  );
}
