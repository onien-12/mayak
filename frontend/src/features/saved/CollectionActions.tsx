import { Ellipsis, Link2, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import type { CollectionDetail } from '@/shared/api';
import { ConfirmDialog, Dropdown, DropdownItem, IconButton, toast } from '@/shared/ui';

import { CollectionDialog } from './CollectionDialog';
import { useDeleteCollection } from './useCollections';

async function copyLink(collection: CollectionDetail): Promise<void> {
  const url = `${window.location.origin}/collections/${collection.id}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: collection.title, url });
      return;
    }
    await navigator.clipboard.writeText(url);
    toast.success(
      collection.is_public
        ? 'Ссылка скопирована'
        : 'Ссылка скопирована — откроется только у вас, подборка личная',
    );
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError')) {
      toast.error('Не получилось скопировать ссылку');
    }
  }
}

/** Header actions: share link for everyone; edit and delete for the owner. */
export function CollectionActions({ collection }: { collection: CollectionDetail }) {
  const navigate = useNavigate();
  const remove = useDeleteCollection();
  const [dialog, setDialog] = useState<'edit' | 'delete' | null>(null);

  return (
    <>
      <IconButton
        icon={Link2}
        label="Поделиться ссылкой"
        onClick={() => void copyLink(collection)}
      />
      {collection.can_edit && (
        <>
          <Dropdown
            label="Действия с подборкой"
            trigger={(props) => <IconButton {...props} icon={Ellipsis} label="Ещё" />}
          >
            <DropdownItem icon={Pencil} onSelect={() => setDialog('edit')}>
              Редактировать
            </DropdownItem>
            <DropdownItem icon={Trash2} danger onSelect={() => setDialog('delete')}>
              Удалить подборку
            </DropdownItem>
          </Dropdown>
          <CollectionDialog
            open={dialog === 'edit'}
            onClose={() => setDialog(null)}
            collection={collection}
          />
          <ConfirmDialog
            open={dialog === 'delete'}
            onClose={() => setDialog(null)}
            onConfirm={() =>
              remove.mutate(collection.id, {
                onSuccess: () => navigate('/saved?tab=collections', { replace: true }),
              })
            }
            title="Удалить подборку?"
            description={`«${collection.title}» исчезнет вместе со списком мест. Сами места останутся на карте.`}
            confirmLabel="Удалить"
            danger
            loading={remove.isPending}
          />
        </>
      )}
    </>
  );
}
