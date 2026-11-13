import { LEVEL_META } from '@/shared/lib/labels';
import { TONES } from '@/shared/lib/tones';
import { cn } from '@/shared/lib/cn';

const DEMO_PASSWORD = 'mayak2026';

const DEMO_ACCOUNTS = [
  {
    email: 'demo@mayak-vl.ru',
    name: 'Аня',
    role: LEVEL_META.trusted.label,
    tone: LEVEL_META.trusted.tone,
  },
  { email: 'moderator@mayak-vl.ru', name: 'Марина', role: 'Модератор', tone: 'official' },
  { email: 'newcomer@mayak-vl.ru', name: 'Новичок', role: 'Холодный режим', tone: 'neutral' },
] as const;

interface DemoAccountsProps {
  onPick: (email: string, password: string) => void;
}

/** Subtle helper for the jury: one tap fills the credentials of a seeded account. */
export function DemoAccounts({ onPick }: DemoAccountsProps) {
  return (
    <div className="rounded-card border border-dashed border-line p-3">
      <p className="text-xs text-ink-faint">Демо-аккаунты — нажмите, чтобы подставить данные</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {DEMO_ACCOUNTS.map((account) => (
          <button
            key={account.email}
            type="button"
            onClick={() => onPick(account.email, DEMO_PASSWORD)}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-[filter] hover:brightness-95',
              TONES[account.tone].soft,
            )}
          >
            {account.name}
            <span className="opacity-60">· {account.role}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
