import { Trophy } from 'lucide-react';
import { motion } from 'motion/react';

import type { UserBrief } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { formatNumber, plural, PLURALS } from '@/shared/lib/format';
import { SPRING, StaggerItem, UserChip } from '@/shared/ui';

import { ChartCard } from './ChartCard';

const MEDALS = ['bg-beam text-ink', 'bg-line text-ink', 'bg-tourism-soft text-tourism-ink'];

/** Top contributors by reputation with a bar relative to the leader. */
export function Leaderboard({ users }: { users: readonly UserBrief[] }) {
  if (users.length === 0) return null;
  const top = Math.max(1, users[0]?.reputation ?? 1);

  return (
    <ChartCard title="Кто помогает городу" subtitle="Лучшие жители по репутации" delay={0.15}>
      <ol className="flex flex-col gap-1">
        {users.map((user, index) => (
          <StaggerItem key={user.id} index={index} className="flex flex-col gap-1.5 py-1.5">
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                  MEDALS[index] ?? 'bg-canvas text-ink-soft',
                )}
              >
                {index === 0 ? <Trophy size={14} aria-label="1" /> : index + 1}
              </span>
              <UserChip user={user} size="sm" className="flex-1" />
              <span className="shrink-0 text-right">
                <span className="font-display text-base font-semibold text-ink tabular-nums">
                  {formatNumber(user.reputation)}
                </span>
                <span className="block text-2xs text-ink-faint">
                  {plural(user.reputation, PLURALS.point)}
                </span>
              </span>
            </div>
            <span className="ml-10 h-1.5 overflow-hidden rounded-full bg-canvas">
              <motion.span
                initial={{ scaleX: 0 }}
                animate={{ scaleX: Math.max(0, user.reputation) / top }}
                transition={{ ...SPRING.soft, delay: 0.2 + index * 0.06 }}
                className="block h-full origin-left rounded-full bg-beam"
              />
            </span>
          </StaggerItem>
        ))}
      </ol>
    </ChartCard>
  );
}
