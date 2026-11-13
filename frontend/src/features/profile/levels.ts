import type { UserLevel } from '@/shared/api';
import { LEVEL_META, LEVELS } from '@/shared/lib/labels';

interface LevelRules {
  /** How publications of this level appear on the map (SPEC §2). */
  publishing: string;
  /** How much the level's verification votes matter — qualitative on purpose, the maths stays server-side. */
  influence: string;
  placesPerDay: number;
}

export const LEVEL_RULES: Record<UserLevel, LevelRules> = {
  newcomer: {
    publishing: 'Публикации сначала проверяет модератор',
    influence: 'Можно подтверждать и уточнять чужие места',
    placesPerDay: 3,
  },
  resident: {
    publishing: 'Публикации сразу появляются на карте',
    influence: 'Подтверждения учитываются в полную силу',
    placesPerDay: 10,
  },
  trusted: {
    publishing: 'Публикации сразу появляются на карте',
    influence: 'Мнение при проверке мест учитывается сильнее',
    placesPerDay: 30,
  },
  expert: {
    publishing: 'Публикации сразу получают отметку «Есть подтверждения»',
    influence: 'Наибольшее доверие к подтверждениям',
    placesPerDay: 100,
  },
};

export interface LevelProgress {
  /** 0..1 inside the current level. */
  share: number;
  /** Reputation still needed for the next level; `null` at the top level. */
  left: number | null;
  nextLevel: UserLevel | null;
}

export function levelProgress(
  level: UserLevel,
  reputation: number,
  next: { level: UserLevel; reputation_required: number } | null,
): LevelProgress {
  if (!next) return { share: 1, left: null, nextLevel: null };
  const from = LEVEL_META[level].from;
  const span = Math.max(1, next.reputation_required - from);
  const share = Math.min(1, Math.max(0, (reputation - from) / span));
  return { share, left: Math.max(0, next.reputation_required - reputation), nextLevel: next.level };
}

export function levelIndex(level: UserLevel): number {
  return LEVELS.indexOf(level);
}
