import { LogIn } from 'lucide-react';
import { motion } from 'motion/react';
import { Link, useLocation } from 'react-router';

import { openAuthModal, useAuth } from '@/features/auth';
import { NotificationBell } from '@/features/notifications';
import { cn } from '@/shared/lib/cn';
import { Avatar, IconButton, SPRING, usePanelStore } from '@/shared/ui';

import { RAIL_WIDTH } from './layout';
import { Logo } from './Logo';
import {
  isNavItemActive,
  MODERATION_NAV,
  PRIMARY_NAV,
  PROBLEMS_NAV,
  STATS_NAV,
  type NavItem,
} from './navigation';
import { UserMenu } from './UserMenu';

function RailLink({ item }: { item: NavItem }) {
  const { pathname } = useLocation();
  const active = isNavItemActive(item, pathname);
  const reveal = usePanelStore((state) => state.reveal);
  const Icon = item.icon;

  return (
    <Link
      to={item.to}
      // A section is asked for — its panel comes back even if it was folded away.
      onClick={reveal}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex w-full flex-col items-center gap-1 py-2 text-2xs font-medium transition-colors duration-150',
        active ? 'text-brand' : 'text-ink-soft hover:text-ink',
      )}
    >
      {active && (
        <motion.span
          aria-hidden
          layoutId="nav-rail-marker"
          transition={SPRING.layout}
          className="absolute top-2.5 left-0 h-8 w-1 rounded-r-full bg-beam"
        />
      )}
      <span
        className={cn(
          'flex h-9 w-12 items-center justify-center rounded-control transition-colors duration-150',
          active ? 'bg-brand-soft' : 'group-hover:bg-canvas',
        )}
      >
        <Icon size={21} strokeWidth={active ? 2.3 : 2} aria-hidden />
      </span>
      {item.label}
    </Link>
  );
}

/** Desktop navigation rail: logo, sections, notifications and the account menu. */
export function NavRail() {
  const { user, isModerator } = useAuth();

  return (
    <nav
      aria-label="Разделы"
      style={{ width: RAIL_WIDTH }}
      className="absolute inset-y-0 left-0 z-40 flex flex-col items-center border-r border-line bg-surface py-4"
    >
      <Link to="/" className="mb-5 rounded-control">
        <Logo layout="stacked" />
      </Link>
      <div className="flex w-full flex-col gap-1">
        {PRIMARY_NAV.map((item) => (
          <RailLink key={item.to} item={item} />
        ))}
      </div>
      <div className="mt-auto flex w-full flex-col items-center gap-1">
        <RailLink item={PROBLEMS_NAV} />
        <RailLink item={STATS_NAV} />
        {isModerator && <RailLink item={MODERATION_NAV} />}
        <span aria-hidden className="my-1.5 h-px w-8 bg-line" />
        <NotificationBell placement="right-end" />
        {user ? (
          <UserMenu
            placement="right-end"
            trigger={(props) => (
              <button
                {...props}
                type="button"
                aria-label="Меню аккаунта"
                className="mt-1 rounded-full ring-2 ring-transparent transition-shadow hover:ring-beam"
              >
                <Avatar id={user.id} name={user.display_name} size={40} />
              </button>
            )}
          />
        ) : (
          <IconButton
            icon={LogIn}
            label="Войти"
            size="lg"
            variant="solid"
            className="mt-1 rounded-full"
            onClick={() => openAuthModal('login')}
          />
        )}
      </div>
    </nav>
  );
}
