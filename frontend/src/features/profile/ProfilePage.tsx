import { Map as MapIcon, UserX } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';

import { useAuth } from '@/features/auth';
import { ApiError, type UserProfile } from '@/shared/api';
import { buttonClasses, EmptyState, ErrorState, PageLayout, Skeleton } from '@/shared/ui';

import { ColdModeCard } from './ColdModeCard';
import { HomeAreaPicker, HomePrompt } from './HomeArea';
import { ProfileHero } from './ProfileHero';
import { ProfileTabs } from './ProfileTabs';
import { ReputationCard } from './ReputationCard';
import { StatsGrid } from './StatsGrid';
import { TopContributors } from './TopContributors';
import { useHomeArea } from './useHome';
import { useProfile } from './useProfile';
import { useProfileTab } from './useProfileTab';

function parseId(raw: string | undefined): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function ProfileSkeleton() {
  return (
    <div
      className="grid gap-4 lg:grid-cols-[minmax(0,380px)_1fr] lg:gap-6"
      role="status"
      aria-label="Загрузка"
    >
      <div className="flex flex-col gap-4">
        <Skeleton className="h-72 rounded-panel" />
        <Skeleton className="h-44 rounded-panel" />
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-40 rounded-card" />
        <Skeleton className="h-64 rounded-card" />
      </div>
    </div>
  );
}

function ProfileBody({ profile }: { profile: UserProfile }) {
  const { user, permissions } = useAuth();
  const own = user?.id === profile.id;
  const home = useHomeArea();
  const tabState = useProfileTab(own);
  const [pickingHome, setPickingHome] = useState(false);
  const pickHome = () => setPickingHome(true);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_1fr] lg:items-start lg:gap-6">
      <div className="flex flex-col gap-4 lg:sticky lg:top-0">
        <ProfileHero profile={profile} own={own} onEdit={() => tabState.setTab('settings')} />
        <ReputationCard profile={profile} permissions={own ? permissions : null} />
        {own && permissions && profile.level === 'newcomer' && (
          <ColdModeCard permissions={permissions} reputation={profile.reputation} />
        )}
        {own && user && !user.home && <HomePrompt onPick={pickHome} />}
        <div className="hidden lg:block">
          <TopContributors highlightId={profile.id} />
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-5">
        <StatsGrid stats={profile.stats} />
        <ProfileTabs userId={profile.id} own={own} onPickHome={pickHome} state={tabState} />
        <div className="lg:hidden">
          <TopContributors highlightId={profile.id} />
        </div>
      </div>
      {own && (
        <HomeAreaPicker open={pickingHome} onClose={() => setPickingHome(false)} initial={home} />
      )}
    </div>
  );
}

/**
 * Resident profile (`/users/:id`, own at `/profile`): reputation and level progress, what the
 * level gives, contribution stats, respects, publications — and for the owner the reputation
 * history, territory subscriptions, «Мой район» and settings.
 */
export default function ProfilePage() {
  const params = useParams();
  const { user } = useAuth();
  const id = params.id === undefined ? (user?.id ?? null) : parseId(params.id);
  const profile = useProfile(id);
  const notFound =
    (params.id !== undefined && id === null) ||
    (profile.error instanceof ApiError && profile.error.status === 404);
  const own = user?.id === id;

  return (
    <PageLayout
      title={own ? 'Мой профиль' : 'Профиль жителя'}
      subtitle={own ? 'Репутация, публикации и настройки' : profile.data?.display_name}
    >
      {notFound ? (
        <EmptyState
          icon={UserX}
          title="Такого жителя нет"
          description="Возможно, ссылка устарела или аккаунт удалён."
          action={
            <Link to="/" className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
              <MapIcon size={16} aria-hidden />
              Вернуться к карте
            </Link>
          }
        />
      ) : profile.isError ? (
        <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />
      ) : profile.data ? (
        <ProfileBody profile={profile.data} />
      ) : (
        <ProfileSkeleton />
      )}
    </PageLayout>
  );
}
