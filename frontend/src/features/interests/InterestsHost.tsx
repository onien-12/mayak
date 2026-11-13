import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { useAuth } from '@/features/auth';
import { interestsApi, queryKeys } from '@/shared/api';

import { InterestsDialog } from './InterestsDialog';
import { useInterestsPicker, useLocalInterests } from './localStore';
import { useMyInterests, usePersonalization, useSaveInterests } from './useInterests';

/**
 * After a sign-in: an account that has never answered the picker takes over the topics this
 * browser picked as a visitor (SPEC §23.3). Also refreshes open area cards when the profile
 * changes — lists and recommendations carry the profile key in their query keys already.
 */
function useProfileSync(): void {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const mine = useMyInterests();
  const local = useLocalInterests((state) => state.topics);
  const { key } = usePersonalization();
  const synced = useRef(false);
  const lastKey = useRef(key);

  const account = isAuthenticated ? mine.data : undefined;
  useEffect(() => {
    if (!isAuthenticated) synced.current = false;
    if (!account || synced.current) return;
    if (account.onboarded || account.topics.length > 0 || local.length === 0) return;
    synced.current = true;
    interestsApi
      .save({ topics: local })
      .then((saved) => queryClient.setQueryData(queryKeys.me.interests, saved))
      .catch(() => undefined);
  }, [isAuthenticated, account, local, queryClient]);

  useEffect(() => {
    if (lastKey.current === key) return;
    lastKey.current = key;
    void queryClient.invalidateQueries({ queryKey: queryKeys.areas.details });
  }, [key, queryClient]);
}

/**
 * Mounted once by the app shell: keeps the profile in sync and hosts the shared picker
 * dialog (`openInterestsPicker()`).
 */
export function InterestsHost() {
  useProfileSync();
  const { isAuthenticated } = useAuth();
  const { open, source, session, closePicker } = useInterestsPicker();
  const dismissInvite = useLocalInterests((state) => state.dismissInvite);
  const local = useLocalInterests((state) => state.topics);
  const mine = useMyInterests();
  const save = useSaveInterests();
  const initial = isAuthenticated && mine.data ? mine.data.topics : local;

  const skip = () => {
    if (source === 'invite') dismissInvite();
    closePicker();
  };

  return (
    <InterestsDialog
      key={session}
      open={open}
      onClose={closePicker}
      initial={initial}
      saving={save.isPending}
      skipLabel={source === 'settings' ? 'Отмена' : 'Пропустить'}
      onSkip={skip}
      onSave={(topics) => save.mutate(topics, { onSuccess: closePicker })}
    />
  );
}
