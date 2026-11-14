import { Cloud, FilePen, HardDrive, Play, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Button, ConfirmDialog, IconButton, StaggerItem } from '@/shared/ui';
import { savedAgo } from './summaries';

export interface DraftRow {
  key: string;
  title: string;
  /** «3 точки», «2 этапа». */
  facts: string;
  savedAt: string;
  where: 'device' | 'account';
  /** «правка опубликованного», «есть правки на этом устройстве». */
  note?: string;
  onContinue: () => void;
  remove: { title: string; text: string; run: () => void; busy?: boolean };
}

function Row({ row, onDelete }: { row: DraftRow; onDelete: () => void }) {
  const Where = row.where === 'device' ? HardDrive : Cloud;
  return (
    <li className="flex flex-col gap-2 rounded-card border border-dashed border-ink-faint/50 bg-surface p-3">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-canvas text-ink-soft">
          <FilePen size={17} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">{row.title}</span>
          <span className="block text-xs text-ink-soft">
            {row.facts} · сохранён {savedAgo(row.savedAt)}
          </span>
          <span className="flex items-center gap-1 text-xs text-ink-soft">
            <Where size={12} aria-hidden className="shrink-0" />
            {row.where === 'device' ? 'на этом устройстве' : 'в аккаунте'}
            {row.note && ` · ${row.note}`}
          </span>
        </span>
      </div>
      <div className="flex items-center justify-end gap-1">
        <IconButton icon={Trash2} label={`Удалить черновик «${row.title}»`} onClick={onDelete} />
        <Button size="sm" icon={Play} onClick={row.onContinue}>
          Продолжить
        </Button>
      </div>
    </li>
  );
}

/** «Черновики» above a catalog: unfinished work on this device and drafts kept in the account. */
export function DraftsBlock({ rows }: { rows: readonly DraftRow[] }) {
  const [asking, setAsking] = useState<DraftRow | null>(null);
  if (rows.length === 0) return null;

  return (
    <section aria-labelledby="drafts" className="flex flex-col gap-2">
      <h2 id="drafts" className="font-display text-sm font-semibold text-ink">
        Черновики
      </h2>
      <ul className="flex flex-col gap-1.5">
        {rows.map((row, index) => (
          <StaggerItem key={row.key} index={index}>
            <Row row={row} onDelete={() => setAsking(row)} />
          </StaggerItem>
        ))}
      </ul>
      <ConfirmDialog
        open={asking !== null}
        onClose={() => setAsking(null)}
        onConfirm={() => {
          asking?.remove.run();
          setAsking(null);
        }}
        title={asking?.remove.title ?? ''}
        description={asking?.remove.text}
        confirmLabel="Удалить"
        danger
        loading={asking?.remove.busy}
      />
    </section>
  );
}
