import { BellRing, Home, Lock, LocateFixed, MapPinned, Navigation } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useState } from 'react';

import { useMapActions } from '@/features/map';
import type { UserMe } from '@/shared/api';
import { formatDate } from '@/shared/lib/format';
import type { LatLng } from '@/shared/lib/geo';
import { Button, ConfirmDialog, Rise } from '@/shared/ui';

import { MapPicker } from './MapPicker';
import { homeChangeDate, useRemoveHome, useSaveHome } from './useHome';

const BENEFITS = [
  { icon: MapPinned, text: 'Карта открывается у дома' },
  { icon: Navigation, text: 'Быстрый переход «рядом с домом»' },
  { icon: BellRing, text: 'Уведомления об отключениях и событиях поблизости' },
] as const;

const PRIVACY =
  'Видно только вам. Используем для подсказок рядом с домом и для повышения достоверности карты.';

function Privacy() {
  return (
    <p className="flex gap-2 text-xs text-ink-soft">
      <Lock size={13} aria-hidden className="mt-0.5 shrink-0" />
      {PRIVACY}
    </p>
  );
}

interface HomeAreaPickerProps {
  open: boolean;
  onClose: () => void;
  initial: LatLng | null;
}

/** Picks the home point on the map; the label (street / district) is resolved on save. */
export function HomeAreaPicker({ open, onClose, initial }: HomeAreaPickerProps) {
  const { start, isSaving } = useSaveHome(onClose);
  return (
    <MapPicker
      open={open}
      title="Где ваш район?"
      initial={initial}
      confirmLabel="Сохранить"
      loading={isSaving}
      onConfirm={start}
      onCancel={onClose}
    >
      <p className="text-sm text-ink-soft">
        Поставьте булавку на свой дом или улицу — точный адрес не нужен.
      </p>
      <Privacy />
    </MapPicker>
  );
}

/** Compact invitation near the top of the own profile while no home is set. */
export function HomePrompt({ onPick }: { onPick: () => void }) {
  return (
    <Rise
      delay={0.1}
      className="flex flex-col gap-3 rounded-panel border border-line/70 bg-surface p-4 shadow-card"
    >
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-beam-soft text-ink">
          <Home size={19} aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink">Укажите «Мой район»</h2>
          <p className="text-sm text-ink-soft">Карта откроется у дома, а мы подскажем, что рядом</p>
        </div>
      </div>
      <Button variant="soft" icon={LocateFixed} onClick={onPick}>
        Отметить на карте
      </Button>
    </Rise>
  );
}

interface HomeAreaCardProps {
  me: UserMe;
  onPick: () => void;
}

/** «Мой район» in the settings: benefits, the saved area, change (with cooldown) and remove. */
export function HomeAreaCard({ me, onPick }: HomeAreaCardProps) {
  const navigate = useNavigate();
  const { flyTo } = useMapActions();
  const remove = useRemoveHome();
  const [confirming, setConfirming] = useState(false);
  const home = me.home;
  const lockedUntil = homeChangeDate(me);

  const showOnMap = () => {
    if (!home) return;
    navigate('/');
    flyTo(home, { minZoom: 15 });
  };

  return (
    <section
      aria-labelledby="home-area"
      className="flex flex-col gap-4 rounded-card border border-line/70 p-4"
    >
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-beam-soft text-ink">
          <Home size={19} aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 id="home-area" className="text-base font-semibold text-ink">
            Мой район
          </h3>
          <p className="truncate text-sm text-ink-soft">
            {home ? (home.label ?? 'Отмечен на карте') : 'Не указан'}
            {home && ` · с ${formatDate(home.set_at)}`}
          </p>
        </div>
      </div>
      <ul className="flex flex-col gap-2">
        {BENEFITS.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-center gap-2.5 text-sm text-ink">
            <Icon size={16} aria-hidden className="shrink-0 text-brand" />
            {text}
          </li>
        ))}
      </ul>
      <Privacy />
      {home ? (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-3 gap-2">
            <Button variant="secondary" size="sm" icon={MapPinned} onClick={showOnMap}>
              На карте
            </Button>
            <Button variant="secondary" size="sm" disabled={lockedUntil !== null} onClick={onPick}>
              Изменить
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-danger-ink"
              onClick={() => setConfirming(true)}
            >
              Убрать
            </Button>
          </div>
          {lockedUntil && (
            <p className="text-xs text-ink-soft">
              Можно изменить после {formatDate(lockedUntil.toISOString())}
            </p>
          )}
        </div>
      ) : (
        <Button variant="soft" icon={LocateFixed} onClick={onPick}>
          Отметить на карте
        </Button>
      )}
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => remove.mutate(undefined, { onSettled: () => setConfirming(false) })}
        loading={remove.isPending}
        title="Убрать мой район?"
        description={`Карта перестанет открываться у дома, уведомления об отключениях и событиях поблизости прекратятся.${lockedUntil ? ` Указать район снова можно будет после ${formatDate(lockedUntil.toISOString())}.` : ''}`}
        confirmLabel="Убрать"
        danger
      />
    </section>
  );
}
