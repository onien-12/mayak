import { LocateFixed, Search, X } from 'lucide-react';

import { useUserLocation } from '@/features/map';
import { cn } from '@/shared/lib/cn';
import { Chip, IconButton, Input, toast } from '@/shared/ui';

import { FULL_ROUTE_MESSAGE } from './actions';
import { useBuilderStore } from './store';
import { TOOLS } from './tools';

/** What a map tap does, plus «Я здесь». `floating` — the phone chip row over the map. */
export function ToolChips({ floating = false }: { floating?: boolean }) {
  const tool = useBuilderStore((state) => state.tool);
  const setTool = useBuilderStore((state) => state.setTool);
  const { locate, status } = useUserLocation();

  const addHere = async () => {
    const point = await locate();
    if (!point) return;
    if (useBuilderStore.getState().addStop(point, { title: 'Моё местоположение' }) === null) {
      toast.info(FULL_ROUTE_MESSAGE);
    }
  };

  return (
    <div
      className={cn(
        'no-scrollbar flex gap-2 overflow-x-auto',
        floating ? 'px-3 pb-1 [&>*]:shadow-card' : '-mx-4 px-4 lg:-mx-5 lg:px-5',
      )}
    >
      {TOOLS.map((item) => (
        <Chip
          key={item.tool}
          icon={item.icon}
          selected={tool === item.tool}
          onClick={() => setTool(item.tool)}
          className={cn(floating && tool !== item.tool && 'bg-surface text-ink')}
        >
          {item.label}
        </Chip>
      ))}
      <Chip
        icon={LocateFixed}
        tone="official"
        disabled={status === 'locating'}
        onClick={() => void addHere()}
        className={cn(floating && 'bg-surface text-ink')}
      >
        Я здесь
      </Chip>
    </div>
  );
}

interface StopSearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  pill?: boolean;
  onFocus?: () => void;
}

/** Search for a place or an address to add as a stop. */
export function StopSearchField({ value, onChange, pill = false, onFocus }: StopSearchFieldProps) {
  return (
    <Input
      type="search"
      enterKeyHint="search"
      icon={Search}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onFocus={onFocus}
      placeholder="Найти место или адрес"
      aria-label="Найти место или адрес для точки"
      className={cn(
        '[&::-webkit-search-cancel-button]:hidden',
        pill && 'rounded-full border-line/70 shadow-card glass',
      )}
      trailing={
        value && <IconButton icon={X} label="Очистить" size="sm" onClick={() => onChange('')} />
      }
    />
  );
}
