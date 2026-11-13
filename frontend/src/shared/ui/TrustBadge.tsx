import type { PlaceStatus } from '../api/types';
import { STATUS_META } from '../lib/labels';
import { Badge } from './Badge';

interface TrustBadgeProps {
  status: PlaceStatus;
  size?: 'sm' | 'md';
  className?: string;
}

/** Verification status of a publication — identical in cards, lists and moderation. */
export function TrustBadge({ status, size = 'sm', className }: TrustBadgeProps) {
  const meta = STATUS_META[status];
  return (
    <Badge
      tone={meta.tone}
      icon={meta.icon}
      size={size}
      title={meta.description}
      className={className}
    >
      {meta.label}
    </Badge>
  );
}
