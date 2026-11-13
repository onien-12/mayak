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
}

/** Lost and found things (SPEC §26). */
export const LOST_NAV: NavItem = {
  to: '/lost',
  label: 'Потеряшки',
  icon: PackageSearch,
  match: ['/lost'],
};
export const SAVED_NAV: NavItem = {
  to: '/saved',
  label: 'Избранное',
  icon: Heart,
  match: ['/saved', '/collections'],
};

/** Phone tab bar: four sections, the fifth slot is «Ещё» (the menu of the rest and the account). */
export const TAB_BAR_NAV: readonly NavItem[] = [
  { to: '/', label: 'Карта', icon: MapIcon, match: [] },
  { to: '/events', label: 'События', icon: CalendarDays, match: ['/events'] },
  { to: '/routes', label: 'Маршруты', icon: Route, match: ['/routes', '/quests'] },
  LOST_NAV,
];

/** Desktop rail, upper group. */
export const PRIMARY_NAV: readonly NavItem[] = [...TAB_BAR_NAV, SAVED_NAV];

/** Utility outages and residents' problems; `/outages` is the old address of outages. */
export const PROBLEMS_NAV: NavItem = {
  to: '/problems',
  label: 'Проблемы',
  icon: TriangleAlert,
  match: ['/problems', '/outages'],
};
export const STATS_NAV: NavItem = {
  to: '/stats',
  label: 'Статистика',
  icon: ChartColumn,
  match: ['/stats'],
};
export const MODERATION_NAV: NavItem = {
  to: '/moderation',
  label: 'Модерация',
  icon: ShieldCheck,
  match: ['/moderation'],
};

const OVERLAY_PREFIXES = ['/users', '/profile', '/moderation', '/stats'];

const hasPrefix = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.to === '/') return pathname === '/';
  return item.match.some((prefix) => hasPrefix(pathname, prefix));
}

/** True on wide overlay pages (profile, moderation, statistics) that cover the map. */
export function useIsOverlayRoute(): boolean {
  const { pathname } = useLocation();
  return OVERLAY_PREFIXES.some((prefix) => hasPrefix(pathname, prefix));
}
