import { Check, Lightbulb, Minus } from 'lucide-react';

import type { AttributeValue, FieldDef, PlaceDetail } from '@/shared/api';
import { formatNumber } from '@/shared/lib/format';

function formatValue(field: FieldDef, value: AttributeValue): string {
  if (field.type === 'select') {
    return field.options?.find((option) => option.value === String(value))?.label ?? String(value);
  }
  if (field.type === 'number' && typeof value === 'number') {
    return `${formatNumber(value)}${field.unit ? ` ${field.unit}` : ''}`;
  }
  return `${String(value)}${field.unit ? ` ${field.unit}` : ''}`;
}

/**
 * Objective facts about the place rendered from the category `fields` — visually separate
 * from reviews, which are subjective.
 */
export function AttributesBlock({ place }: { place: PlaceDetail }) {
  const rows = place.category.fields.flatMap((field) => {
    const value = place.attributes[field.key];
    return value === undefined || value === '' ? [] : [{ field, value }];
  });

  if (rows.length === 0 && !place.tips && place.tags.length === 0) return null;

  return (
    <section aria-label="Характеристики" className="flex flex-col gap-3">
      {rows.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-ink">Характеристики</h2>
          <p className="text-xs text-ink-faint">Факты о месте — их уточняют жители</p>
          <dl className="mt-2 divide-y divide-line rounded-card border border-line bg-surface">
            {rows.map(({ field, value }) => (
              <div
                key={field.key}
                className="flex items-center justify-between gap-4 px-3.5 py-2.5 text-sm"
              >
                <dt className="text-ink-soft">{field.label}</dt>
                <dd className="text-right font-medium text-ink">
                  {typeof value === 'boolean' ? (
                    value ? (
                      <span className="inline-flex items-center gap-1 text-success-ink">
                        <Check size={15} strokeWidth={2.6} aria-hidden /> Да
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-ink-soft">
                        <Minus size={15} aria-hidden /> Нет
                      </span>
                    )
                  ) : (
                    formatValue(field, value)
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {place.tips && (
        <div className="flex gap-3 rounded-card bg-beam-soft p-3.5">
          <Lightbulb size={18} aria-hidden className="mt-0.5 shrink-0 text-warning-ink" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-ink">Совет от местных</h2>
            <p className="mt-0.5 text-sm whitespace-pre-line text-ink-soft">{place.tips}</p>
          </div>
        </div>
      )}

      {place.tags.length > 0 && (
        <ul aria-label="Теги" className="flex flex-wrap gap-1.5">
          {place.tags.map((tag) => (
            <li
              key={tag}
              className="rounded-full bg-canvas px-2.5 py-1 text-xs font-medium text-ink-soft"
            >
              #{tag}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
