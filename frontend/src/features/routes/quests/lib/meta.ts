import { KeyRound, MapPinCheck, MessageCircleQuestion, type LucideIcon } from 'lucide-react';

import type { QuestCondition } from '@/shared/api';
import type { Tone } from '@/shared/lib/tones';

interface ConditionMeta {
  label: string;
  /** What the player does, said to the player. */
  task: string;
  icon: LucideIcon;
  tone: Tone;
}

export const CONDITIONS: readonly QuestCondition[] = ['arrival', 'code', 'answer'];

export const CONDITION_META: Record<QuestCondition, ConditionMeta> = {
  arrival: {
    label: 'Прийти на место',
    task: 'Найдите место и нажмите «Я на месте» — проверим по геолокации.',
    icon: MapPinCheck,
    tone: 'tourism',
  },
  code: {
    label: 'Код на месте',
    task: 'На месте вы узнаете код — у человека, на вывеске или в лавке. Введите его.',
    icon: KeyRound,
    tone: 'event',
  },
  answer: {
    label: 'Ответ на вопрос',
    task: 'Ответьте на вопрос о месте — ответ можно узнать только там.',
    icon: MessageCircleQuestion,
    tone: 'infrastructure',
  },
};

export const QUEST_PLURALS = {
  quest: ['квест', 'квеста', 'квестов'],
  stage: ['этап', 'этапа', 'этапов'],
  player: ['игрок', 'игрока', 'игроков'],
  hint: ['подсказка', 'подсказки', 'подсказок'],
  playerFinished: ['человек прошёл', 'человека прошли', 'человек прошли'],
} as const satisfies Record<string, readonly [string, string, string]>;

/** Game rule shown before a hint is taken (SPEC §27). */
export const HINT_PENALTY_MIN = 5;
/** Wrong tries on a stage before a minute's pause. */
export const MAX_TRIES = 5;

/** «1:05:12» or «42:13» — a result on the board. */
export function formatResult(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${minutes}:${pad(rest)}`;
}

/** Link a teammate opens to join the run. */
export function joinLink(code: string): string {
  return `${window.location.origin}/quests/join/${code}`;
}
