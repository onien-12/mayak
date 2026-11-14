import { useSearchParams } from 'react-router';

export type ProfileTab =
  'places' | 'routes' | 'events' | 'reputation' | 'subscriptions' | 'settings';

const PUBLIC_TABS = [
  { value: 'places', label: 'Места' },
  { value: 'routes', label: 'Маршруты' },
] as const satisfies readonly { value: ProfileTab; label: string }[];

const OWN_TABS = [
  ...PUBLIC_TABS,
  { value: 'events', label: 'Мои события' },
  { value: 'reputation', label: 'Репутация' },
  { value: 'subscriptions', label: 'Подписки' },
  { value: 'settings', label: 'Настройки' },
] as const satisfies readonly { value: ProfileTab; label: string }[];

const TAB_PARAM = 'tab';

/** Active tab kept in `?tab=` so the browser back button and shared links restore it. */
export function useProfileTab(own: boolean) {
  const [params, setParams] = useSearchParams();
  const tabs: readonly { value: ProfileTab; label: string }[] = own ? OWN_TABS : PUBLIC_TABS;
  const raw = params.get(TAB_PARAM);
  const tab = tabs.find((item) => item.value === raw)?.value ?? 'places';
  const setTab = (next: ProfileTab) =>
    setParams(
      (prev) => {
        const updated = new URLSearchParams(prev);
        updated.set(TAB_PARAM, next);
        return updated;
      },
      { replace: true },
    );
  return { tab, tabs, setTab };
}
