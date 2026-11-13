import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FlaskConical, Play, Users } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { requireAuth } from '@/features/auth';
import {
  errorMessage,
  queryKeys,
  questsApi,
  type QuestDetail,
  type QuestRunStartInput,
} from '@/shared/api';
import { Button, Field, Input, Modal, SegmentedControl, toast } from '@/shared/ui';

type TeamMode = 'create' | 'join';

function TeamDialog({
  open,
  onClose,
  onCreate,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
  busy: boolean;
}) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<TeamMode>('create');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const cleanCode = code.replace(/\s+/g, '').toUpperCase();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Игра командой"
      description="Прогресс общий: этап, пройденный одним, открывается всем. Загадку каждого этапа видит только один игрок — по очереди, так что придётся говорить друг с другом."
      footer={
        mode === 'create' ? (
          <Button
            block
            icon={Users}
            loading={busy}
            disabled={name.trim().length < 2}
            onClick={() => onCreate(name.trim())}
          >
            Создать команду
          </Button>
        ) : (
          <Button
            block
            disabled={cleanCode.length < 4}
            onClick={() => navigate(`/quests/join/${cleanCode}`)}
          >
            Присоединиться
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-4">
        <SegmentedControl<TeamMode>
          label="Что сделать"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'create', label: 'Я капитан' },
            { value: 'join', label: 'У меня есть код' },
          ]}
        />
        {mode === 'create' ? (
          <Field
            label="Название команды"
            htmlFor="team-name"
            hint="Его увидят в таблице результатов"
          >
            <Input
              id="team-name"
              value={name}
              maxLength={40}
              placeholder="Например: Морские котики"
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
        ) : (
          <Field label="Код команды" htmlFor="team-code" hint="Его покажет капитан у себя в игре">
            <Input
              id="team-code"
              value={code}
              maxLength={12}
              autoCapitalize="characters"
              placeholder="Например: K7QX2M"
              className="tracking-widest uppercase"
              onChange={(event) => setCode(event.target.value)}
            />
          </Field>
        )}
      </div>
    </Modal>
  );
}

/** The footer of a quest: continue, play solo or as a team; the author tries it as a player. */
export function QuestStartActions({ quest }: { quest: QuestDetail }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [teamOpen, setTeamOpen] = useState(false);
  const start = useMutation({
    mutationFn: (input: QuestRunStartInput) => questsApi.start(quest.id, input),
    onSuccess: (run) => {
      queryClient.setQueryData(queryKeys.quests.run(run.id), run);
      void queryClient.invalidateQueries({ queryKey: queryKeys.quests.detail(quest.id) });
      navigate(`/quests/play/${run.id}`);
    },
    onError: (error) => {
      toast.error(errorMessage(error));
      void queryClient.invalidateQueries({ queryKey: queryKeys.quests.detail(quest.id) });
    },
  });
  const run = quest.my_run;

  if (run) {
    return (
      <Button block size="lg" icon={Play} onClick={() => navigate(`/quests/play/${run.id}`)}>
        {run.is_test ? 'Продолжить проверку' : 'Продолжить'} · этап {run.stage_number} из{' '}
        {run.stages_total}
      </Button>
    );
  }
  if (quest.can_edit) {
    return (
      <Button
        block
        size="lg"
        icon={FlaskConical}
        loading={start.isPending}
        onClick={() => start.mutate({ test: true })}
      >
        Пройти как игрок
      </Button>
    );
  }

  const play = (action: () => void) => requireAuth(action, 'чтобы играть');
  return (
    <>
      <div className="flex gap-2">
        <Button
          size="lg"
          icon={Play}
          className="flex-1"
          loading={start.isPending && !teamOpen}
          onClick={() => play(() => start.mutate({}))}
        >
          Играть
        </Button>
        <Button
          size="lg"
          variant="secondary"
          icon={Users}
          className="flex-1"
          onClick={() => play(() => setTeamOpen(true))}
        >
          Командой
        </Button>
      </div>
      <TeamDialog
        open={teamOpen}
        onClose={() => setTeamOpen(false)}
        busy={start.isPending}
        onCreate={(name) => start.mutate({ team: true, team_name: name })}
      />
    </>
  );
}
