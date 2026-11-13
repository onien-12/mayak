import { RefreshCw } from 'lucide-react';

import { Button, EmptyState } from '@/shared/ui';

/** Last-resort screen for unexpected render errors. */
export function RouteError() {
  return (
    <div className="flex h-full items-center justify-center bg-canvas">
      <EmptyState
        icon={RefreshCw}
        tone="danger"
        title="Что-то сломалось"
        description="Мы уже знаем об ошибке. Обновите страницу — обычно это помогает."
        action={<Button onClick={() => window.location.reload()}>Обновить страницу</Button>}
      />
    </div>
  );
}
