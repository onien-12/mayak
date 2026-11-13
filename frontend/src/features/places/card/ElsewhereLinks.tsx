import type { LatLng } from '@/shared/lib/geo';

const CITY = 'Владивосток';

interface ElsewhereLinksProps {
  title: string;
  point: LatLng;
  /** The linked 2GIS object's page, if any (otherwise a search by name). */
  twoGisUrl?: string | null;
}

/** Search links by name and coordinates: no data is copied, the user reads reviews there. */
function searchLinks(title: string, { lat, lng }: LatLng, twoGisUrl: string | null | undefined) {
  const text = encodeURIComponent(title);
  return [
    {
      key: '2gis',
      label: '2ГИС',
      url: twoGisUrl ?? `https://2gis.ru/vladivostok/search/${text}?m=${lng},${lat}/17`,
    },
    {
      key: 'yandex',
      label: 'Яндекс Картах',
      url: `https://yandex.ru/maps/?text=${text}&ll=${lng},${lat}&z=17`,
    },
    {
      key: 'google',
      label: 'Google Maps',
      url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${title}, ${CITY}`)}`,
    },
  ];
}

/**
 * «Отзывы в 2ГИС · Яндекс Картах · Google Maps» — search links by name and point (SPEC §19).
 * The sources' ratings live in the card's rating line, not here.
 */
export function ElsewhereLinks({ title, point, twoGisUrl }: ElsewhereLinksProps) {
  return (
    <section aria-label="Отзывы в других сервисах">
      <p className="flex flex-wrap items-center gap-x-1 text-sm text-ink-soft">
        <span>Отзывы в</span>
        {searchLinks(title, point, twoGisUrl).map((link, index, all) => (
          <span key={link.key} className="inline-flex items-center">
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center font-medium text-brand underline-offset-2 hover:underline"
            >
              {link.label}
            </a>
            {index < all.length - 1 && <span aria-hidden>&nbsp;·</span>}
          </span>
        ))}
      </p>
    </section>
  );
}
