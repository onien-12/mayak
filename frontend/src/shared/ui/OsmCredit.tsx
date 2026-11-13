import { cn } from '../lib/cn';
import { OSM_COPYRIGHT_URL } from '../lib/osm';

/** «© участники OpenStreetMap» — required (ODbL) wherever OSM-derived data is shown. */
export function OsmCredit({ prefix, className }: { prefix?: string; className?: string }) {
  return (
    <span className={cn('text-xs text-ink-faint', className)}>
      {prefix}
      <a
        href={OSM_COPYRIGHT_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="underline decoration-ink-faint/40 underline-offset-2 hover:text-ink-soft"
      >
        © участники OpenStreetMap
      </a>
    </span>
  );
}
