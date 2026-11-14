import { Cloud, HardDriveDownload, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/shared/ui';

import type { DeviceSave } from './useAutosave';
import { savedAgo } from './summaries';

const TICK_MS = 30_000;

/** What still stops a save to the account, said plainly, with a way to fix it. */
export interface AccountBlocker {
  /** Continues «Чтобы сохранить в аккаунт, …»: «добавьте ещё одну точку». */
  text: string;
  fix?: { label: string; run: () => void };
}

export interface AccountSave {
  blocker: AccountBlocker | null;
  saving: boolean;
  onSave: () => void;
}

interface DraftStatusProps {
  device: DeviceSave;
  /** Something was entered or changed in this session. */
  touched: boolean;
  /** `null`: saving a draft to the account is not offered here (signed out, or a published
   * route or quest — its own save button keeps it). */
  account: AccountSave | null;
}

function useTick(): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), TICK_MS);
    return () => window.clearInterval(timer);
  }, []);
}

/**
 * The quiet line under the builder's title: where the draft is kept right now — on this device,
 * after every change — and how to keep it in the account.
 */
export function DraftStatus({ device, touched, account }: DraftStatusProps) {
  useTick();
  if (!touched && !device.savedAt) return null;

  return (
    <div className="flex flex-col gap-1 rounded-control bg-canvas px-3 py-2 text-xs text-ink-soft">
      {device.failed ? (
        <p className="flex items-center gap-1.5 text-warning-ink">
          <TriangleAlert size={14} aria-hidden className="shrink-0" />
          Черновик не сохраняется на этом устройстве — сохраните его в аккаунт.
        </p>
      ) : (
        <p className="flex items-center gap-1.5" role="status">
          <HardDriveDownload size={14} aria-hidden className="shrink-0 text-success" />
          {device.savedAt
            ? `Черновик сохранён на этом устройстве · ${savedAgo(device.savedAt)}`
            : 'Сохраняем черновик на этом устройстве…'}
        </p>
      )}
      {account &&
        (account.blocker ? (
          <p className="flex flex-wrap items-center gap-x-1.5">
            <Cloud size={14} aria-hidden className="shrink-0" />
            Чтобы сохранить в аккаунт, {account.blocker.text}.
            {account.blocker.fix && (
              <button
                type="button"
                onClick={account.blocker.fix.run}
                className="font-medium text-brand underline-offset-2 hover:underline"
              >
                {account.blocker.fix.label}
              </button>
            )}
          </p>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            icon={Cloud}
            loading={account.saving}
            onClick={account.onSave}
            className="-ml-2 self-start"
          >
            Сохранить черновик в аккаунт
          </Button>
        ))}
    </div>
  );
}
