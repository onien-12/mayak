import { KeyRound, MapPinOff, MonitorX } from 'lucide-react';

import { Spinner } from '@/shared/ui';

import type { MapStatus } from './types';

const MESSAGES = {
  'no-key': {
    icon: KeyRound,
    title: 'Карта не подключена',
    text: 'Добавьте ключ 2GIS в файл frontend/.env и перезапустите приложение. Списки и карточки мест работают и без карты.',
    code: 'VITE_2GIS_KEY=ваш_ключ',
  },
  unsupported: {
    icon: MonitorX,
    title: 'Браузер не поддерживает карту',
    text: 'Для карты нужен WebGL. Обновите браузер или включите аппаратное ускорение — списки и карточки мест доступны и так.',
    code: null,
  },
  error: {
    icon: MapPinOff,
    title: 'Карта не загрузилась',
    text: 'Не удалось связаться с сервером карт 2GIS. Проверьте соединение и обновите страницу.',
    code: null,
  },
} as const;

/** Friendly stand-in for the map while it loads or when it cannot be shown. */
export function MapFallback({ status }: { status: Exclude<MapStatus, 'ready'> }) {
  if (status === 'loading') {
    return (
      <div className="absolute inset-0 flex items-center justify-center lg:pl-[500px]">
        <div className="flex items-center gap-2.5 rounded-full border border-line/70 px-4 py-2 text-sm text-ink-soft shadow-card glass">
          <Spinner size={16} />
          Загружаем карту…
        </div>
      </div>
    );
  }

  const { icon: Icon, title, text, code } = MESSAGES[status];
  return (
    <div className="absolute inset-0 flex items-start justify-center p-5 pt-24 lg:items-center lg:pt-5 lg:pl-[520px]">
      <div className="max-w-sm rounded-panel border border-line bg-surface p-6 text-center shadow-float">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-beam-soft text-brand">
          <Icon size={26} aria-hidden />
        </div>
        <h2 className="font-display text-base font-semibold text-ink">{title}</h2>
        <p className="mt-1.5 text-sm text-ink-soft">{text}</p>
        {code && (
          <code className="mt-4 block rounded-control bg-canvas px-3 py-2 font-mono text-xs text-ink">
            {code}
          </code>
        )}
      </div>
    </div>
  );
}
