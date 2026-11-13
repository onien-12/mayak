import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import {
  errorMessage,
  questsApi,
  type QuestCheckInput,
  type QuestCheckResult,
  type QuestRun,
} from '@/shared/api';
import { toast } from '@/shared/ui';

import { useStoreRun } from '../useQuests';
import { currentPosition, positionProblem } from './position';

interface CheckOptions {
  answer?: string;
  /** Test runs: the author confirms the arrival by a button. */
  onSite?: boolean;
}

/**
 * Everything a player does in a run. Every check happens on the server: the position, the code
 * or the answer goes there and only «passed or not» comes back. A passed stage shows up in the
 * stored run, where the run screen notices it (for teammates' passes as well).
 */
export function useRunActions(run: QuestRun) {
  const store = useStoreRun();
  const [locating, setLocating] = useState(false);
  const current = run.current;

  const check = useMutation({
    mutationFn: (input: QuestCheckInput) => questsApi.check(run.id, input),
    onSuccess: (result: QuestCheckResult) => {
      store(result.run);
      if (!result.passed) toast.info(result.message);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const submit = async ({ answer, onSite = false }: CheckOptions = {}) => {
    if (!current) return;
    const input: QuestCheckInput = { stage: current.position, answer };
    if (current.check_arrival && !onSite) {
      setLocating(true);
      try {
        const position = await currentPosition();
        Object.assign(input, position);
      } catch (error) {
        toast.error(positionProblem(error));
        return;
      } finally {
        setLocating(false);
      }
    }
    if (onSite) input.on_site = true;
    check.mutate(input);
  };

  const hint = useMutation({
    mutationFn: () => questsApi.hint(run.id, current?.position ?? 0),
    onSuccess: store,
    onError: (error) => toast.error(errorMessage(error)),
  });

  const lead = useMutation({
    mutationFn: (userId: number) => questsApi.lead(run.id, userId),
    onSuccess: (updated) => {
      store(updated);
      toast.success('Загадка передана');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return { submit, busy: locating || check.isPending, locating, hint, lead };
}
