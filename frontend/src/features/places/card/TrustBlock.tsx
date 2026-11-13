import { CircleDashed, History } from 'lucide-react';

import type { PlaceDetail } from '@/shared/api';
import { formatDate, formatRelative } from '@/shared/lib/format';
import { EXTERNAL_SOURCE_META, STATUS_META } from '@/shared/lib/labels';
import { isUnconfirmedImport } from '@/shared/lib/imports';
import {
  Badge,
  Banner,
  ExternalBadge,
  OsmCredit,
  TrustBadge,
  TrustMeter,
  UserChip,
} from '@/shared/ui';

/**
 * How much the publication can be trusted: status, 0–100 meter, freshness and — separately —
 * who added it (author reputation is not publication status). The vote counts are on the
 * vote buttons of `VerificationBlock`.
 */
export function TrustBlock({ place }: { place: PlaceDetail }) {
  const status = STATUS_META[place.status];
  const source = place.external && EXTERNAL_SOURCE_META[place.external.source];

  return (
    <section
      aria-label="Достоверность"
      className="rounded-card border border-line bg-surface p-3.5"
    >
      <div className="flex items-start justify-between gap-3">
        {isUnconfirmedImport(place) ? (
          // The source's own baseline is not a resident confirmation — do not present it as one.
          <Badge tone="neutral" icon={CircleDashed} size="md">
            Ждёт подтверждения жителей
          </Badge>
        ) : (
          <TrustBadge status={place.status} size="md" />
        )}
        <span className="text-right text-xs text-ink-faint">
          {place.last_confirmed_at
            ? `Подтверждено ${formatRelative(place.last_confirmed_at)}`
            : 'Ещё никто не подтверждал'}
        </span>
      </div>
      <p className="mt-2 text-sm text-ink-soft">
        {source
          ? `${source.description}. Жители могут подтвердить или опровергнуть информацию.`
          : `${status.description}.`}
      </p>
      <TrustMeter score={place.trust_score} className="mt-3" />
      {place.is_stale && (
        <Banner tone="warning" icon={History} title="Давно не проверялось" className="mt-3">
          Последнее подтверждение было больше полугода назад. Если вы рядом — отметьте, актуально ли
          это.
        </Banner>
      )}
      <div className="mt-3 border-t border-line pt-3">
        {place.external ? (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
            <ExternalBadge external={place.external} size="md" />
            {place.external.source === 'osm' && <OsmCredit />}
            {place.external.source === 'wikivoyage' && (
              <a
                href={place.external.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-ink-faint underline decoration-ink-faint/40 underline-offset-2 hover:text-ink-soft"
              >
                {EXTERNAL_SOURCE_META.wikivoyage.linkLabel}, CC BY-SA
              </a>
            )}
            {place.external.source !== 'osm' && place.external.source !== 'wikivoyage' && (
              <span className="text-xs text-ink-faint">
                Импортировано {formatDate(place.created_at)}
              </span>
            )}
          </div>
        ) : (
          <UserChip
            user={place.author}
            size="sm"
            caption={`Автор · добавлено ${formatDate(place.created_at)}`}
          />
        )}
      </div>
    </section>
  );
}
