import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { TopicSlug } from '@/shared/api';

import { orderTopics } from './topics';

interface LocalInterestsState {
  /** Topics a visitor without an account picked — sent as the `topics` parameter. */
  topics: TopicSlug[];
  /** The «Выберите интересы» invitation was dismissed in this browser. */
  inviteDismissed: boolean;
  setTopics: (topics: readonly TopicSlug[]) => void;
  dismissInvite: () => void;
}

/** Interest profile of this browser — persisted, never sent anywhere but as `topics`. */
export const useLocalInterests = create<LocalInterestsState>()(
  persist(
    (set) => ({
      topics: [],
      inviteDismissed: false,
      setTopics: (topics) => set({ topics: orderTopics(topics) }),
      dismissInvite: () => set({ inviteDismissed: true }),
    }),
    {
      name: 'mayak-interests',
      version: 1,
      // A stored value is user-editable: keep known slugs only.
      merge: (persisted, current) => {
        const stored = (persisted ?? {}) as Partial<LocalInterestsState>;
        return {
          ...current,
          topics: orderTopics(Array.isArray(stored.topics) ? stored.topics : []),
          inviteDismissed: stored.inviteDismissed === true,
        };
      },
    },
  ),
);

/** Where the shared picker was opened from: decides what «Пропустить» means. */
export type PickerSource = 'invite' | 'settings';

/** The shared «Что вам интересно?» dialog (the onboarding step after sign-up is its own). */
interface PickerState {
  open: boolean;
  source: PickerSource;
  /** Bumped on every opening — the dialog is keyed by it to start from the saved topics. */
  session: number;
  openPicker: (source: PickerSource) => void;
  closePicker: () => void;
}

export const useInterestsPicker = create<PickerState>((set, get) => ({
  open: false,
  source: 'invite',
  session: 0,
  openPicker: (source) => set({ open: true, source, session: get().session + 1 }),
  closePicker: () => set({ open: false }),
}));

/** Opens «Что вам интересно?» — for visitors too (their choice stays in this browser). */
export function openInterestsPicker(source: PickerSource = 'invite'): void {
  useInterestsPicker.getState().openPicker(source);
}
