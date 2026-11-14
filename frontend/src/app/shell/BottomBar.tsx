import { Menu } from 'lucide-react';
import { motion } from 'motion/react';
import { Link, useLocation } from 'react-router';

import { useAuth } from '@/features/auth';
import { cn } from '@/shared/lib/cn';
import { Avatar, SPRING } from '@/shared/ui';

import { TAB_BAR_HEIGHT } from './layout';
import { isNavItemActive, MAIN_NAV, useIsInMore } from './navigation';
import { UserMenu } from './UserMenu';

const TAB =
  'relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-2xs font-medium transition-[color,transform] duration-150 active:scale-95';

function ActiveMark({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <motion.span
      aria-hidden
      layoutId="tab-bar-marker"
      transition={SPRING.layout}
      className="absolute top-0 h-[3px] w-9 rounded-b-full bg-beam"
    />
  );
}

/** Phone tab bar: the three main sections and «Ещё» — the other sections and the account. */
export function BottomBar() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  // «Ещё» is the active tab while one of its sections or a profile page is open.
  const inMenu = useIsInMore();

  return (
    <nav
      aria-label="Разделы"
      className="absolute inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-safe"
    >
      <div className="flex" style={{ height: TAB_BAR_HEIGHT }}>
        {MAIN_NAV.map((item) => {
          const active = isNavItemActive(item, pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={active ? 'page' : undefined}
              className={cn(TAB, active ? 'text-brand' : 'text-ink-soft')}
            >
              <ActiveMark active={active} />
              <Icon size={22} strokeWidth={active ? 2.3 : 2} aria-hidden />
              {item.label}
            </Link>
          );
        })}
        <UserMenu
          placement="top-end"
          withSections
          trigger={(props, { open }) => (
            <button
              {...props}
              type="button"
              className={cn(TAB, inMenu || open ? 'text-brand' : 'text-ink-soft')}
            >
              <ActiveMark active={inMenu} />
              {user ? (
                <Avatar id={user.id} name={user.display_name} size={24} />
              ) : (
                <Menu size={22} aria-hidden />
              )}
              Ещё
            </button>
          )}
        />
      </div>
    </nav>
  );
}
