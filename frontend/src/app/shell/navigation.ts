import {
  CalendarDays,
  ChartColumn,
  Heart,
  Map as MapIcon,
  PackageSearch,
  Route,
  ShieldCheck,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { useLocation } from 'react-router';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Path prefixes that mark the item as active (besides `to`). */
  match: readonly string[];
  /** «Ещё» only: what is behind the word, in a few plain words. */
  hint?: string;
}

/**
 * The main sections: the phone tab bar and the upper part of the desktop rail. Everything else
 * is one «Ещё» away (`MORE_NAV`), so neither shows a long column of icons.
 */
export const MAIN_NAV: readonly NavItem[] = [
  { to: '/', label: 'Карта', icon: MapIcon, match: [] },
  { to: '/events', label: 'События', icon: CalendarDays, match: ['/events'] },
  { to: '/routes', label: 'Маршруты', icon: Route, match: ['/routes', '/quests'] },
];

/** Lost and found things (SPEC §26). */
export const LOST_NAV: NavItem = {
  to: '/lost',
  label: 'Потеряшки',
  icon: PackageSearch,
  match: ['/lost'],
  hint: 'Находки и пропажи',
};
/** Utility outages and residents' problems; `/outages` is the old address of outages. */
export const PROBLEMS_NAV: NavItem = {
  to: '/problems',
  label: 'Проблемы',
  icon: TriangleAlert,
  match: ['/problems', '/outages'],
  hint: 'Отключения и сообщения жителей',
};
export const SAVED_NAV: NavItem = {
  to: '/saved',
  label: 'Избранное',
  icon: Heart,
  match: ['/saved', '/collections'],
  hint: 'Сохранённые места и маршруты',
};
export const STATS_NAV: NavItem = {
  to: '/stats',
  label: 'Статистика',
  icon: ChartColumn,
  match: ['/stats'],
  hint: 'Пульс города',
};
export const MODERATION_NAV: NavItem = {
  to: '/moderation',
  label: 'Модерация',
  icon: ShieldCheck,
  match: ['/moderation'],
  hint: 'Обращения и удержанные публикации',
};

/** The sections behind «Ещё», in its order; moderation only for those who may moderate. */
export function moreNav(isModerator: boolean): NavItem[] {
  return [LOST_NAV, PROBLEMS_NAV, SAVED_NAV, STATS_NAV, ...(isModerator ? [MODERATION_NAV] : [])];
}

const OVERLAY_PREFIXES = ['/users', '/profile', '/moderation', '/stats'];

const hasPrefix = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.to === '/') return pathname === '/';
  return item.match.some((prefix) => hasPrefix(pathname, prefix));
}

/**
 * «Ещё» is the active item while one of its sections is open, or an overlay page (profile,
 * a user, moderation, statistics) — so the user can see where they are on both breakpoints.
 */
export function useIsInMore(): boolean {
  const { pathname } = useLocation();
  const overlay = useIsOverlayRoute();
  return overlay || moreNav(true).some((item) => isNavItemActive(item, pathname));
}

/** True on wide overlay pages (profile, moderation, statistics) that cover the map. */
export function useIsOverlayRoute(): boolean {
  const { pathname } = useLocation();
  return OVERLAY_PREFIXES.some((prefix) => hasPrefix(pathname, prefix));
}
