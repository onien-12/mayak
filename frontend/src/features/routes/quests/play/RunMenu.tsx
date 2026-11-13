import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DoorOpen, Ellipsis, Flag } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { errorMessage, queryKeys, questsApi, type QuestRun } from '@/shared/api';
import { ConfirmDialog, Dropdown, DropdownItem, IconButton, toast } from '@/shared/ui';

type Exit = 'leave' | 'abandon';

const COPY: Record<Exit, { title: string; text: string; confirm: string }> = {
  leave: {
    title: 'Выйти из команды?',
    text: 'Команда продолжит без вас; если загадка этапа была у вас, она перейдёт к следующему игроку.',
    confirm: 'Выйти',
  },
  abandon: {
    title: 'Завершить прохождение?',
    text: 'Прогресс сохранится в истории, но в таблицу результатов это прохождение не попадёт. Начать заново можно со страницы квеста.',
    confirm: 'Завершить',
  },
};

/** Leaving a team or stopping the run (the captain, or a solo player). */
export function RunMenu({ run, viewerId }: { run: QuestRun; viewerId: number }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState<Exit | null>(null);
  const isCaptain = run.captain_id === viewerId;
  const exit = useMutation({
    mutationFn: (kind: Exit) =>
      kind === 'leave' ? questsApi.leave(run.id) : questsApi.abandon(run.id),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: queryKeys.quests.run(run.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.quests.detail(run.quest_id) });
      navigate(`/quests/${run.quest_id}`, { replace: true });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (run.current === null) return null;
  const options: Exit[] = run.is_team
    ? isCaptain
      ? ['leave', 'abandon']
      : ['leave']
    : ['abandon'];

  return (
    <>
      <Dropdown
        label="Прохождение"
        trigger={(props) => <IconButton {...props} icon={Ellipsis} label="Ещё" />}
      >
        {options.map((kind) => (
          <DropdownItem
            key={kind}
            icon={kind === 'leave' ? DoorOpen : Flag}
            danger={kind === 'abandon'}
            onSelect={() => setAsking(kind)}
          >
            {kind === 'leave' ? 'Выйти из команды' : 'Завершить прохождение'}
          </DropdownItem>
        ))}
      </Dropdown>
      <ConfirmDialog
        open={asking !== null}
        onClose={() => setAsking(null)}
        onConfirm={() => asking && exit.mutate(asking)}
        title={asking ? COPY[asking].title : ''}
        description={asking ? COPY[asking].text : ''}
        confirmLabel={asking ? COPY[asking].confirm : ''}
        danger
        loading={exit.isPending}
      />
    </>
  );
}
