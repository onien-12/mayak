import { Cloud, FilePen, HardDrive, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { ConfirmDialog, IconButton, ListCard, ListMark, StaggerItem } from '@/shared/ui';
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

/** A draft row: a tap continues it; the bin asks before removing. */
function Row({ row, onDelete }: { row: DraftRow; onDelete: () => void }) {
  const Where = row.where === 'device' ? HardDrive : Cloud;
  return (
    <ListCard
      dashed
      compact
      media={
        <span className="flex size-full items-center justify-center text-ink-soft">
          <FilePen size={20} aria-hidden />
        </span>
      }
      title={row.title}
      label={`Продолжить черновик «${row.title}»`}
      onSelect={row.onContinue}
      meta={`${row.facts} · сохранён ${savedAgo(row.savedAt)}`}
      marks={
        <ListMark icon={Where}>
          {row.where === 'device' ? 'на этом устройстве' : 'в аккаунте'}
          {row.note && ` · ${row.note}`}
        </ListMark>
      }
      trailing={
        <IconButton icon={Trash2} label={`Удалить черновик «${row.title}»`} onClick={onDelete} />
      }
    />
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
