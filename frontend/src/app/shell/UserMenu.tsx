import { LogIn, LogOut, UserRound, UserRoundPlus } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';

import { openAuthModal, useAuth } from '@/features/auth';
import { pluralize, PLURALS } from '@/shared/lib/format';
import {
  Avatar,
  Dropdown,
  DropdownItem,
  DropdownSeparator,
  LevelBadge,
  type PopoverPlacement,
  type PopoverTriggerProps,
} from '@/shared/ui';

import { MODERATION_NAV, PROBLEMS_NAV, SAVED_NAV, STATS_NAV, type NavItem } from './navigation';

interface UserMenuProps {
  placement: PopoverPlacement;
  /**
   * Phones: «Ещё» — the sections that have no tab come first, the account after them.
   */
  withSections?: boolean;
  trigger: (props: PopoverTriggerProps, state: { open: boolean }) => ReactNode;
}

/** Auth-aware account menu: profile / sign out for users, sign in / sign up for guests. */
export function UserMenu({ placement, withSections = false, trigger }: UserMenuProps) {
  const { user, isModerator, logout } = useAuth();
  const navigate = useNavigate();
  const sections: NavItem[] = [
    PROBLEMS_NAV,
    SAVED_NAV,
    STATS_NAV,
    ...(isModerator ? [MODERATION_NAV] : []),
  ];

  return (
    <Dropdown
      label={withSections ? 'Ещё' : 'Аккаунт'}
      placement={placement}
      trigger={trigger}
      className="w-64"
    >
      {withSections && (
        <>
          {sections.map((item) => (
            <DropdownItem key={item.to} icon={item.icon} onSelect={() => navigate(item.to)}>
              {item.label}
            </DropdownItem>
          ))}
          <DropdownSeparator />
        </>
      )}
      {user ? (
        <>
          <div className="flex items-center gap-3 px-2.5 py-2">
            <Avatar id={user.id} name={user.display_name} size={40} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{user.display_name}</p>
              <div className="mt-0.5 flex items-center gap-1.5">
                <LevelBadge level={user.level} role={user.role} />
                <span className="text-xs text-ink-faint">
                  {pluralize(user.reputation, PLURALS.point)}
                </span>
              </div>
            </div>
          </div>
          <DropdownSeparator />
          <DropdownItem icon={UserRound} onSelect={() => navigate('/profile')}>
            Мой профиль
          </DropdownItem>
        </>
      ) : (
        <>
          <DropdownItem icon={LogIn} onSelect={() => openAuthModal('login')}>
            Войти
          </DropdownItem>
          <DropdownItem icon={UserRoundPlus} onSelect={() => openAuthModal('register')}>
            Создать аккаунт
          </DropdownItem>
        </>
      )}
      {user && (
        <>
          <DropdownSeparator />
          <DropdownItem icon={LogOut} onSelect={logout} danger>
            Выйти
          </DropdownItem>
        </>
      )}
    </Dropdown>
  );
}
