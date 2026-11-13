import { Copy, Crown, ScrollText, Share2 } from 'lucide-react';

import type { QuestRun } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { Avatar, Badge, Button, IconButton, toast } from '@/shared/ui';

import { joinLink } from '../lib/meta';

async function shareCode(run: QuestRun, code: string): Promise<void> {
  const url = joinLink(code);
  const text = `Присоединяйся к команде «${run.team_name ?? ''}» в квесте «${run.quest_title}». Код: ${code}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: run.quest_title, text, url });
      return;
    }
    await navigator.clipboard.writeText(`${text}\n${url}`);
    toast.success('Приглашение скопировано');
  } catch {
    // The share sheet was closed or the clipboard refused: nothing to report.
  }
}

interface TeamPanelProps {
  run: QuestRun;
  viewerId: number;
  onHandLead: (userId: number) => void;
  handing: boolean;
}

/** The team: invite code and link, who is the captain, who holds the current riddle. */
export function TeamPanel({ run, viewerId, onHandLead, handing }: TeamPanelProps) {
  const isCaptain = run.captain_id === viewerId;
  const code = run.join_code;
  const playing = run.current !== null;

  return (
    <section
      aria-labelledby="team"
      className="flex flex-col gap-3 rounded-card border border-line p-3.5"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id="team" className="font-display text-base font-semibold text-ink">
          Команда «{run.team_name}»
        </h2>
        <span className="text-xs text-ink-soft">{run.members.length} из 8</span>
      </div>
      {code && (
        <div className="flex items-center gap-2 rounded-control bg-canvas p-2 pl-3">
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-ink-soft">Код для друзей</span>
            <span className="font-display text-xl font-semibold tracking-[0.2em] text-ink">
              {code}
            </span>
          </span>
          <IconButton
            icon={Copy}
            label="Скопировать код"
            onClick={() =>
              void navigator.clipboard
                .writeText(code)
                .then(() => toast.success('Код скопирован'))
                .catch(() => undefined)
            }
          />
          <Button size="sm" icon={Share2} onClick={() => void shareCode(run, code)}>
            Позвать
          </Button>
        </div>
      )}
      <ul className="flex flex-col gap-1.5">
        {run.members.map((member) => (
          <li
            key={member.user.id}
            className={cn(
              'flex items-center gap-2.5 rounded-control px-2 py-1.5',
              member.is_lead && 'bg-beam-soft',
            )}
          >
            <Avatar id={member.user.id} name={member.user.display_name} size={28} />
            <span className="min-w-0 flex-1 truncate text-sm text-ink">
              {member.user.display_name}
              {member.user.id === viewerId && <span className="text-ink-soft"> · вы</span>}
            </span>
            {member.is_captain && (
              <Badge tone="neutral" icon={Crown} size="sm">
                Капитан
              </Badge>
            )}
            {member.is_lead && playing && (
              <Badge tone="beam" icon={ScrollText} size="sm">
                Загадка здесь
              </Badge>
            )}
            {isCaptain && playing && !member.is_lead && (
              <Button
                size="sm"
                variant="ghost"
                disabled={handing}
                onClick={() => onHandLead(member.user.id)}
              >
                {member.user.id === viewerId ? 'Взять загадку' : 'Отдать загадку'}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {isCaptain && playing && run.members.length > 1 && (
        <p className="text-xs text-ink-soft">
          Загадка переходит по кругу после каждого этапа. Если ведущий ушёл или сел телефон —
          отдайте её другому.
        </p>
      )}
    </section>
  );
}
