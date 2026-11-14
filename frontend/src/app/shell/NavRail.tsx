import { Ellipsis, LogIn, type LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useLocation } from 'react-router';

import { openAuthModal, useAuth } from '@/features/auth';
import { NotificationBell } from '@/features/notifications';
import { cn } from '@/shared/lib/cn';
import { Avatar, Dropdown, IconButton, SPRING, usePanelStore } from '@/shared/ui';

import { RAIL_WIDTH } from './layout';
import { Logo } from './Logo';
import { isNavItemActive, MAIN_NAV, moreNav, useIsInMore, type NavItem } from './navigation';
import { SectionItems, UserMenu } from './UserMenu';

const RAIL_ITEM =
  'group relative flex w-full flex-col items-center gap-1 py-2 text-2xs font-medium transition-colors duration-150';

/** The marker and the icon tile shared by the links and «Ещё». */
function RailItemBody({
  icon: Icon,
  label,
  active,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
}) {
  return (
    <>
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
      {label}
    </>
  );
}

function RailLink({ item }: { item: NavItem }) {
  const { pathname } = useLocation();
  const active = isNavItemActive(item, pathname);
  const reveal = usePanelStore((state) => state.reveal);

  return (
    <Link
      to={item.to}
      // A section is asked for — its panel comes back even if it was folded away.
      onClick={reveal}
      aria-current={active ? 'page' : undefined}
      className={cn(RAIL_ITEM, active ? 'text-brand' : 'text-ink-soft hover:text-ink')}
    >
      <RailItemBody icon={item.icon} label={item.label} active={active} />
    </Link>
  );
}

const menuItems = (menu: HTMLElement | null) => [
  ...(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []),
];

/**
 * «Ещё» on the rail: the same sections as on phones, in a menu next to the rail. Keyboard: Enter
 * opens it with the first section focused, arrows move, Escape closes it and focus returns here.
 */
function RailMore() {
  const { isModerator } = useAuth();
  const active = useIsInMore();
  const reveal = usePanelStore((state) => state.reveal);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    const menu = () => document.querySelector<HTMLElement>('[role="menu"][aria-label="Ещё"]');
    if (open) {
      const frame = requestAnimationFrame(() => menuItems(menu())[0]?.focus());
      wasOpen.current = true;
      return () => cancelAnimationFrame(frame);
    }
    if (wasOpen.current) {
      wasOpen.current = false;
      const focused = document.activeElement;
      // Back to «Ещё» unless the user moved on to something else (a click elsewhere).
      if (!focused || focused === document.body || menu()?.contains(focused))
        trigger.current?.focus();
    }
  }, [open]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const items = menuItems(event.currentTarget);
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next = (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  };

  return (
    <Dropdown
      label="Ещё"
      placement="right-start"
      open={open}
      onOpenChange={setOpen}
      className="w-72"
      trigger={(props) => (
        <button
          {...props}
          ref={(node) => {
            props.ref(node);
            trigger.current = node;
          }}
          type="button"
          onClick={() => {
            if (!open) reveal();
            props.onClick();
          }}
          className={cn(RAIL_ITEM, active || open ? 'text-brand' : 'text-ink-soft hover:text-ink')}
        >
          <RailItemBody icon={Ellipsis} label="Ещё" active={active} />
        </button>
      )}
    >
      <div onKeyDown={onKeyDown}>
        <SectionItems sections={moreNav(isModerator)} />
      </div>
    </Dropdown>
  );
}

/** Desktop navigation rail: logo, sections, notifications and the account menu. */
export function NavRail() {
  const { user } = useAuth();

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
        {MAIN_NAV.map((item) => (
          <RailLink key={item.to} item={item} />
        ))}
        <RailMore />
      </div>
      <div className="mt-auto flex w-full flex-col items-center gap-1">
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
