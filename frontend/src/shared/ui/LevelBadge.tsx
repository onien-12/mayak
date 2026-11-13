import { ShieldCheck } from 'lucide-react';

import type { UserLevel, UserRole } from '../api/types';
import { LEVEL_META, ROLE_LABELS } from '../lib/labels';
import { Badge } from './Badge';

interface LevelBadgeProps {
  level: UserLevel;
  /** Moderators and admins are shown by role instead of level. */
  role?: UserRole;
  size?: 'sm' | 'md';
  className?: string;
}

export function LevelBadge({ level, role = 'user', size = 'sm', className }: LevelBadgeProps) {
  if (role !== 'user') {
    return (
      <Badge tone="official" icon={ShieldCheck} size={size} className={className}>
        {ROLE_LABELS[role]}
      </Badge>
    );
  }
  const meta = LEVEL_META[level];
  return (
    <Badge
      tone={meta.tone}
      icon={meta.icon}
      size={size}
      className={className}
      title={meta.description}
    >
      {meta.label}
    </Badge>
  );
}
