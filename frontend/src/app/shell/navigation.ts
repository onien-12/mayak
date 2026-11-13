import {
  CalendarDays,
  ChartColumn,
  Heart,
  Map as MapIcon,
  Route,
  ShieldCheck,
  ZapOff,
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

export const PRIMARY_NAV: readonly NavItem[] = [
  { to: '/', label: 'Карта', icon: MapIcon, match: [] },
  { to: '/events', label: 'Афиша', icon: CalendarDays, match: ['/events'] },
  { to: '/routes', label: 'Маршруты', icon: Route, match: ['/routes'] },
  { to: '/saved', label: 'Избранное', icon: Heart, match: ['/saved', '/collections'] },
];

export const OUTAGES_NAV: NavItem = {
  to: '/outages',
  label: 'Отключения',
  icon: ZapOff,
  match: ['/outages'],
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
