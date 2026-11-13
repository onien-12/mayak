import type { ExternalSource } from '../api/types';
import { EXTERNAL_SOURCE_META } from '../lib/labels';
import { Badge } from './Badge';

interface ExternalBadgeProps {
  external: ExternalSource;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Source mark of imported content («Афиша VL.ru», «OpenStreetMap» in its own colour).
 * Outlined on purpose: it must read as neither user content (tinted badges) nor official
 * information (blue shield).
 */
export function ExternalBadge({ external, size = 'sm', className }: ExternalBadgeProps) {
  const meta = EXTERNAL_SOURCE_META[external.source];
  return (
    <Badge
      tone={meta.tone}
      variant="outline"
      icon={meta.icon}
      size={size}
      title={meta.description}
      className={className}
    >
      {external.label}
    </Badge>
  );
}
