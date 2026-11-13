import { CalendarPlus, Clock, Presentation, Users, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';

import type { PlaceDetail } from '@/shared/api';
import { formatNumber } from '@/shared/lib/format';
import { Button } from '@/shared/ui';

function Fact({ icon: Icon, children }: { icon: typeof Clock; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm text-ink">
      <Icon size={16} aria-hidden className="mt-0.5 shrink-0 text-ink-faint" />
      <span className="min-w-0">{children}</span>
    </li>
  );
}

function priceText(place: PlaceDetail): string | null {
  const { free, price } = place.attributes;
  if (free === true) return 'Бесплатно';
  if (typeof price === 'number') return `${formatNumber(price)} ₽ в час`;
  if (free === false) return 'Платно — цену уточните у владельца';
  return null;
}

/**
 * «Площадка для встреч» (SPEC §3.4): what can be held here, for how many, on what terms and how
 * to arrange it — and the way to start a meetup here.
 */
export function VenueSection({ place, onHold }: { place: PlaceDetail; onHold: () => void }) {
  const { activities, capacity, booking, hours } = place.attributes;
  const price = priceText(place);

  return (
    <section
      aria-label="Площадка для встреч"
      className="flex flex-col gap-3 rounded-card bg-infrastructure-soft p-3.5"
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Presentation size={18} aria-hidden className="text-infrastructure-ink" />
        Здесь можно провести встречу
      </div>
      <ul className="flex flex-col gap-1.5">
        {typeof activities === 'string' && <Fact icon={CalendarPlus}>{activities}</Fact>}
        {typeof capacity === 'number' && (
          <Fact icon={Users}>Вмещает до {formatNumber(capacity)} человек</Fact>
        )}
        {price && <Fact icon={Wallet}>{price}</Fact>}
        {typeof hours === 'string' && <Fact icon={Clock}>{hours}</Fact>}
      </ul>
      {typeof booking === 'string' && (
        <p className="rounded-control bg-white/70 px-3 py-2.5 text-sm text-ink">
          <span className="block text-xs text-ink-soft">Как договориться</span>
          {booking}
        </p>
      )}
      <Button block size="lg" icon={CalendarPlus} onClick={onHold}>
        Провести здесь встречу
      </Button>
    </section>
  );
}
