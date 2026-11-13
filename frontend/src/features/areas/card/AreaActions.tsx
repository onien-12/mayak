import { Ellipsis, Pencil, Share2, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { useAuth } from '@/features/auth';
import { useAreaParam } from '@/features/map';
import type { AreaDetail } from '@/shared/api';
import {
  ConfirmDialog,
  Dropdown,
  DropdownItem,
  DropdownSeparator,
  IconButton,
  toast,
} from '@/shared/ui';

import { openEditArea } from '../editor/areaEditorStore';
import { useDeleteArea } from './useArea';

async function share(area: AreaDetail): Promise<void> {
  const url = `${window.location.origin}/?area=${area.id}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: area.title, url });
      return;
    }
    await navigator.clipboard.writeText(url);
    toast.success('Ссылка скопирована');
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError')) {
      toast.error('Не получилось поделиться ссылкой');
    }
  }
}

/** Header actions of the area card: share, edit (author / moderator), delete (moderator). */
export function AreaActions({ area }: { area: AreaDetail }) {
  const { isModerator } = useAuth();
  const { closeArea } = useAreaParam();
  const [confirming, setConfirming] = useState(false);
  const remove = useDeleteArea(area.id, () => {
    setConfirming(false);
    closeArea();
  });

  return (
    <>
      <IconButton icon={Share2} label="Поделиться" onClick={() => void share(area)} />
      {(area.can_edit || isModerator) && (
        <Dropdown
          label="Действия с локацией"
          trigger={(props) => <IconButton {...props} icon={Ellipsis} label="Ещё" />}
        >
          {area.can_edit && (
            <DropdownItem icon={Pencil} onSelect={() => openEditArea(area.id)}>
              Изменить границы и описание
            </DropdownItem>
          )}
          {isModerator && (
            <>
              <DropdownSeparator />
              <DropdownItem icon={Trash2} onSelect={() => setConfirming(true)} danger>
                Удалить локацию
              </DropdownItem>
            </>
          )}
        </Dropdown>
      )}
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => remove.mutate()}
        title="Удалить локацию?"
        description="Места внутри останутся на карте, просто перестанут относиться к ней."
        confirmLabel="Удалить"
        danger
        loading={remove.isPending}
      />
    </>
  );
}
