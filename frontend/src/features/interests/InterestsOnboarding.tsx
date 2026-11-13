import { useEffect, useEffectEvent } from 'react';

import type { TopicSlug } from '@/shared/api';

import { InterestsDialog } from './InterestsDialog';
import { useLocalInterests } from './localStore';
import { useSaveInterests, useTopicCatalog } from './useInterests';

/**
 * The step right after a successful registration (plugged into the auth modal flow by the
 * app shell). Starts from what the person picked as a visitor; «Пропустить» keeps that and
 * marks the picker as answered. An older backend without topics skips the step.
 */
export function InterestsOnboarding({ onDone }: { onDone: () => void }) {
  const local = useLocalInterests((state) => state.topics);
  const { available } = useTopicCatalog();
  const save = useSaveInterests();
  const done = useEffectEvent(onDone);

  useEffect(() => {
    if (!available) done();
  }, [available]);

  const finish = (topics: readonly TopicSlug[]) => {
    if (!save.isPending) save.mutate(topics, { onSettled: onDone });
  };

  return (
    <InterestsDialog
      open={available}
      onClose={() => finish(local)}
      initial={local}
      saving={save.isPending}
      onSkip={() => finish(local)}
      onSave={finish}
      description="Аккаунт готов! Отметьте, что вам по душе, — покажем это первым на карте и в событиях."
    />
  );
}
