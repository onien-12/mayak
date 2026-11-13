import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';

import { RequireAuth, useAuth } from '@/features/auth';
import { errorMessage, queryKeys, questsApi } from '@/shared/api';
import { Banner, Button, Field, Input, PanelLayout, Spinner } from '@/shared/ui';

const BACK = '/routes?view=quests';

/** `/quests/join/:code` — the invite link of a team: joins and opens the game. */
export default function QuestJoinPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  const linked = (useParams().code ?? '').toUpperCase();
  const [code, setCode] = useState(linked);
  const tried = useRef(false);
  const join = useMutation({
    mutationFn: (value: string) => questsApi.join(value),
    onSuccess: (run) => {
      queryClient.setQueryData(queryKeys.quests.run(run.id), run);
      navigate(`/quests/play/${run.id}`, { replace: true });
    },
  });

  useEffect(() => {
    if (!isAuthenticated || tried.current || !linked) return;
    tried.current = true;
    join.mutate(linked);
  }, [isAuthenticated, linked, join]);

  return (
    <PanelLayout title="Вступить в команду" onBack={() => navigate(BACK)} backLabel="К квестам">
      {!isAuthenticated ? (
        <RequireAuth reason="чтобы вступить в команду">{null}</RequireAuth>
      ) : join.isPending ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-soft">
          <Spinner size={18} /> Входим в команду…
        </div>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            join.mutate(code.replace(/\s+/g, ''));
          }}
        >
          {join.isError && <Banner tone="danger">{errorMessage(join.error)}</Banner>}
          <Field label="Код команды" htmlFor="join-code" hint="Его покажет капитан у себя в игре">
            <Input
              id="join-code"
              value={code}
              maxLength={12}
              autoCapitalize="characters"
              className="tracking-widest uppercase"
              onChange={(event) => setCode(event.target.value)}
            />
          </Field>
          <Button type="submit" icon={Users} disabled={code.trim().length < 4}>
            Присоединиться
          </Button>
        </form>
      )}
    </PanelLayout>
  );
}
