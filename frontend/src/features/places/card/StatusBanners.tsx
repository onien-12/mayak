import { Archive, CircleAlert, Clock, EyeOff } from 'lucide-react';

import type { PlaceDetail } from '@/shared/api';
import { Banner, Button } from '@/shared/ui';

interface StatusBannersProps {
  place: PlaceDetail;
  onAppeal: () => void;
}

/** Explains non-public and disputed states: pending, hidden, archived, needs review. */
export function StatusBanners({ place, onAppeal }: StatusBannersProps) {
  const note = place.moderation_note && (
    <p className="mt-1.5 rounded-lg bg-surface/70 px-2.5 py-1.5 text-ink">
      <span className="text-ink-soft">Комментарий модератора: </span>
      {place.moderation_note}
    </p>
  );
  const appeal = place.can_appeal && (
    <Button size="sm" variant="secondary" onClick={onAppeal}>
      Оспорить решение
    </Button>
  );

  switch (place.status) {
    case 'pending':
      return (
        <Banner tone="neutral" icon={Clock} title="На проверке у модератора">
          Публикацию пока видите только вы. После проверки она появится на карте для всех.
          {note}
        </Banner>
      );
    case 'hidden':
      return (
        <Banner tone="danger" icon={EyeOff} title="Скрыто с карты" action={appeal}>
          Публикация скрыта из-за серьёзных сомнений в достоверности.
          {note}
        </Banner>
      );
    case 'archived':
      return (
        <Banner tone="neutral" icon={Archive} title="В архиве" action={appeal}>
          Публикация больше не показывается на карте и сохранена для истории.
          {note}
        </Banner>
      );
    case 'needs_review':
      return (
        <Banner tone="warning" icon={CircleAlert} title="Жители сообщают разное">
          Есть сигналы, что информация неточна. Если вы рядом — проверьте и отметьте ниже.
        </Banner>
      );
    default:
      return null;
  }
}
