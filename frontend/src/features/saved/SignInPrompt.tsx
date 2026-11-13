import { Heart, Library, Route } from 'lucide-react';

import { openAuthModal } from '@/features/auth';
import { Button, Rise } from '@/shared/ui';

const PERKS = [
  { icon: Heart, text: 'Любимые места — на карте в один тап' },
  { icon: Route, text: 'Маршруты, которые хочется пройти' },
  { icon: Library, text: 'Свои подборки: «куда сводить гостей»' },
] as const;

/** Friendly gate of «Избранное» for visitors without an account. */
export function SignInPrompt() {
  return (
    <Rise className="flex flex-col items-center rounded-card bg-linear-to-b from-brand-soft to-surface px-5 pt-7 pb-5 text-center">
      <div className="relative mb-4 flex size-16 items-center justify-center">
        <span aria-hidden className="absolute inset-0 animate-beam-pulse rounded-full bg-beam/40" />
        <span className="relative flex size-14 items-center justify-center rounded-full bg-surface text-issue shadow-card">
          <Heart size={26} aria-hidden className="fill-issue" />
        </span>
      </div>
      <h2 className="font-display text-lg font-semibold text-ink">Сохраняйте любимое</h2>
      <p className="mt-1 max-w-xs text-sm text-ink-soft">
        Войдите, чтобы собирать места, маршруты и подборки — они будут с вами на любом устройстве.
      </p>
      <ul className="mt-4 flex w-full max-w-xs flex-col gap-2 text-left">
        {PERKS.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-center gap-2.5 text-sm text-ink">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface text-brand shadow-card">
              <Icon size={15} aria-hidden />
            </span>
            {text}
          </li>
        ))}
      </ul>
      <div className="mt-5 flex w-full max-w-xs flex-col gap-2">
        <Button size="lg" block onClick={() => openAuthModal('login')}>
          Войти
        </Button>
        <Button variant="ghost" block onClick={() => openAuthModal('register')}>
          Создать аккаунт
        </Button>
      </div>
    </Rise>
  );
}
