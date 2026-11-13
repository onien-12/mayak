import { Check, ChevronDown, LandPlot, MapPinOff, Wand2 } from 'lucide-react';

import type { AreaCard, AreaRef } from '@/shared/api';
import type { LatLng } from '@/shared/lib/geo';
import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
  Spinner,
} from '@/shared/ui';

import type { AreaChoice } from './areaChoice';
import { useAreasAround } from './useAreasAround';

interface AreaFieldProps {
  point: LatLng;
  value: AreaChoice;
  onChange: (choice: AreaChoice) => void;
}

const ref = (area: AreaCard): AreaRef => ({ id: area.id, title: area.title });

/**
 * Creating: no choice to make — a point inside a location belongs to it, a point outside does
 * not. Only says which location the publication gets into, and nothing when there is none.
 */
export function AreaNote({ point, value }: Pick<AreaFieldProps, 'point' | 'value'>) {
  const { detected } = useAreasAround(point);
  const area = value.kind === 'area' ? value.area : value.kind === 'auto' ? detected : null;
  if (!area) return null;

  return (
    <p className="flex items-center gap-1.5 text-sm text-ink-soft">
      <LandPlot size={15} aria-hidden className="shrink-0 text-ink-faint" />
      <span className="truncate">
        Локация: <span className="font-medium text-ink">{area.title}</span>
      </span>
    </p>
  );
}

/**
 * Editing: «Локация: Нагорный парк» — detected from the point exactly like the server does it
 * (smallest territory containing the point); the author may pick another one or none.
 */
export function AreaField({ point, value, onChange }: AreaFieldProps) {
  const { detected, containing, nearby, isLoading } = useAreasAround(point);
  const current = value.kind === 'area' ? value.area : value.kind === 'auto' ? detected : null;
  const outside = value.kind === 'area' && !containing.some((area) => area.id === value.area.id);
  const hint =
    value.kind === 'auto'
      ? detected
        ? 'определили по точке — публикация появится в карточке этой локации'
        : 'рядом нет парка, набережной или района, куда её отнести'
      : value.kind === 'none'
        ? 'не появится в карточках парков, набережных и районов'
        : outside
          ? 'точка за границами этой локации'
          : value.area.id === detected?.id
            ? 'точка внутри этой локации'
            : 'выбрано вручную';
  const options = [...containing, ...nearby];
  const isSelected = (area: AreaCard) => value.kind === 'area' && value.area.id === area.id;

  return (
    <div className="flex items-center gap-3 rounded-card border border-line/70 p-2.5">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
        {isLoading ? <Spinner size={16} /> : <LandPlot size={19} aria-hidden />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">
          {current ? `Локация: ${current.title}` : 'Отдельная точка, вне локаций'}
        </p>
        <p className={`line-clamp-2 text-xs ${outside ? 'text-warning-ink' : 'text-ink-faint'}`}>
          {hint}
        </p>
      </div>
      <Dropdown
        label="Выбор локации"
        placement="bottom-end"
        trigger={(props) => (
          <Button {...props} variant="ghost" size="sm" icon={ChevronDown}>
            Изменить
          </Button>
        )}
      >
        <DropdownItem
          icon={value.kind === 'auto' ? Check : Wand2}
          onSelect={() => onChange({ kind: 'auto' })}
        >
          Определить по точке{detected ? ` — ${detected.title}` : ''}
        </DropdownItem>
        {options.length > 0 && (
          <>
            <DropdownSeparator />
            <DropdownLabel>Локации рядом</DropdownLabel>
            {options.map((area) => (
              <DropdownItem
                key={area.id}
                icon={isSelected(area) ? Check : LandPlot}
                onSelect={() => onChange({ kind: 'area', area: ref(area) })}
              >
                {area.title}
              </DropdownItem>
            ))}
          </>
        )}
        <DropdownSeparator />
        <DropdownItem
          icon={value.kind === 'none' ? Check : MapPinOff}
          onSelect={() => onChange({ kind: 'none' })}
        >
          Отдельная точка, вне локаций
        </DropdownItem>
      </Dropdown>
    </div>
  );
}
