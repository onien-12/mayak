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

import { MODERATION_NAV, OUTAGES_NAV, STATS_NAV } from './navigation';

interface UserMenuProps {
  placement: PopoverPlacement;
  /** Include the secondary sections (phones, where the tab bar has no room for them). */
  withSections?: boolean;
  trigger: (props: PopoverTriggerProps, state: { open: boolean }) => ReactNode;
}

/** Auth-aware account menu: profile / sign out for users, sign in / sign up for guests. */
export function UserMenu({ placement, withSections = false, trigger }: UserMenuProps) {
  const { user, isModerator, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <Dropdown label="Аккаунт" placement={placement} trigger={trigger} className="w-64">
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
      {withSections && (
        <>
          <DropdownSeparator />
          <DropdownItem icon={OUTAGES_NAV.icon} onSelect={() => navigate(OUTAGES_NAV.to)}>
            Отключения воды, тепла и света
          </DropdownItem>
          <DropdownItem icon={STATS_NAV.icon} onSelect={() => navigate(STATS_NAV.to)}>
            Статистика города
          </DropdownItem>
          {isModerator && (
            <DropdownItem icon={MODERATION_NAV.icon} onSelect={() => navigate(MODERATION_NAV.to)}>
              Модерация
            </DropdownItem>
          )}
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
