import { Link } from 'react-router';

import type { UserBrief } from '../api/types';
import { cn } from '../lib/cn';
import { Avatar } from './Avatar';
import { LevelBadge } from './LevelBadge';

interface UserChipProps {
  user: UserBrief;
  size?: 'sm' | 'md';
  /** Link to the profile page (`/users/:id`). */
  linked?: boolean;
  /** Secondary line under the name (date, role in a list…). */
  caption?: string;
  showLevel?: boolean;
  className?: string;
}

/** Avatar + name + level — the one way a user is shown across the app. */
export function UserChip({
  user,
  size = 'md',
  linked = true,
  caption,
  showLevel = true,
  className,
}: UserChipProps) {
  const content = (
    <>
      <Avatar id={user.id} name={user.display_name} size={size === 'sm' ? 28 : 36} />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5">
          <span
            className={cn('truncate font-medium text-ink', size === 'sm' ? 'text-sm' : 'text-base')}
          >
            {user.display_name}
          </span>
          {showLevel && <LevelBadge level={user.level} role={user.role} />}
        </span>
        {caption && <span className="block truncate text-xs text-ink-faint">{caption}</span>}
      </span>
    </>
  );
  const classes = cn('inline-flex min-w-0 items-center gap-2.5 text-left', className);

  if (!linked) return <span className={classes}>{content}</span>;

  return (
    <Link
      to={`/users/${user.id}`}
      className={cn(classes, 'rounded-control transition-opacity hover:opacity-80')}
    >
      {content}
    </Link>
  );
}
