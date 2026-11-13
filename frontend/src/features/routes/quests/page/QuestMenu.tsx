import { Ellipsis, Flag, Pencil, Share2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { requireAuth, useAuth } from '@/features/auth';
import { ComplaintDialog } from '@/features/places';
import type { QuestDetail } from '@/shared/api';
import {
  ConfirmDialog,
  Dropdown,
  DropdownItem,
  DropdownSeparator,
  IconButton,
  toast,
} from '@/shared/ui';

import { useDeleteQuest } from '../useQuests';

async function share(quest: QuestDetail): Promise<void> {
  const url = `${window.location.origin}/quests/${quest.id}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: quest.title, url });
      return;
    }
    await navigator.clipboard.writeText(url);
    toast.success('Ссылка на квест скопирована');
  } catch {
    // The share sheet was closed or the clipboard refused: nothing to report.
  }
}

/** Edit and delete for the author or a moderator; share and a complaint for everyone else. */
export function QuestMenu({ quest }: { quest: QuestDetail }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [dialog, setDialog] = useState<'delete' | 'complaint' | null>(null);
  const remove = useDeleteQuest(quest.id, () => navigate('/routes?view=quests', { replace: true }));
  const live =
    quest.visibility === 'public' &&
    (quest.status === 'published' || quest.status === 'needs_review');
  const reportable = live && quest.author.id !== user?.id;

  return (
    <>
      <Dropdown
        label="Действия с квестом"
        trigger={(props) => <IconButton {...props} icon={Ellipsis} label="Ещё" />}
      >
        {live && (
          <DropdownItem icon={Share2} onSelect={() => void share(quest)}>
            Поделиться
          </DropdownItem>
        )}
        {quest.can_edit && (
          <>
            <DropdownItem icon={Pencil} onSelect={() => navigate(`/quests/${quest.id}/edit`)}>
              Редактировать
            </DropdownItem>
            <DropdownItem icon={Trash2} danger onSelect={() => setDialog('delete')}>
              Удалить
            </DropdownItem>
          </>
        )}
        {reportable && (
          <>
            <DropdownSeparator />
            <DropdownItem
              icon={Flag}
              onSelect={() => requireAuth(() => setDialog('complaint'), 'чтобы пожаловаться')}
            >
              Пожаловаться
            </DropdownItem>
          </>
        )}
      </Dropdown>
      <ComplaintDialog
        open={dialog === 'complaint'}
        onClose={() => setDialog(null)}
        targetType="route"
        targetId={quest.id}
      />
      <ConfirmDialog
        open={dialog === 'delete'}
        onClose={() => setDialog(null)}
        onConfirm={() => remove.mutate()}
        title="Удалить квест?"
        description="Он исчезнет из каталога вместе с результатами и отзывами. Это действие нельзя отменить."
        confirmLabel="Удалить"
        danger
        loading={remove.isPending}
      />
    </>
  );
}
