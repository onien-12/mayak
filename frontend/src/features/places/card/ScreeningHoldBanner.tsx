import { ShieldAlert } from 'lucide-react';
import type { ReactNode } from 'react';

import type { ScreeningHold } from '@/shared/api';
import { Banner } from '@/shared/ui';

const WHAT = {
  place: {
    looks:
      'Модератор посмотрит публикацию и решит, показывать ли её всем. Пока её видите только вы.',
    fix: 'Если что-то не так — исправьте её: модератор увидит новую версию.',
  },
  route: {
    looks:
      'Модератор посмотрит маршрут и решит, показывать ли его в каталоге. Пока его видите только вы.',
    fix: 'Если что-то не так — исправьте его в редакторе: модератор увидит новую версию.',
  },
} as const;

interface ScreeningHoldBannerProps {
  hold: ScreeningHold;
  what: keyof typeof WHAT;
  children?: ReactNode;
}

/**
 * For the author (and moderators): the publication did not pass the automatic check, why,
 * and what happens next (SPEC §24.1).
 */
export function ScreeningHoldBanner({ hold, what, children }: ScreeningHoldBannerProps) {
  return (
    <Banner tone="warning" icon={ShieldAlert} title="Не прошло автоматическую проверку">
      <p>Что нашла проверка:</p>
      <ul className="mt-1 list-disc pl-5 text-ink">
        {hold.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
      <p className="mt-1.5">
        {WHAT[what].looks} {WHAT[what].fix}
      </p>
      {children}
    </Banner>
  );
}
