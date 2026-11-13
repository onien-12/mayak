import { ShieldAlert } from 'lucide-react';

import { Badge } from './Badge';

/**
 * The viewer's own photo, comment, review or note that did not pass the automatic check
 * (SPEC §24.1): nobody else sees it until a moderator decides.
 */
export function OnReviewMark({ className }: { className?: string }) {
  return (
    <Badge
      tone="warning"
      icon={ShieldAlert}
      className={className}
      title="Не прошло автоматическую проверку. Модератор посмотрит и решит, а пока это видите только вы."
    >
      На проверке — пока видите только вы
    </Badge>
  );
}
