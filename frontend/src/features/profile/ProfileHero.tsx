import { CalendarHeart, Pencil, ShieldCheck } from 'lucide-react';

import type { UserProfile } from '@/shared/api';
import { formatDate } from '@/shared/lib/format';
import { ROLE_LABELS } from '@/shared/lib/labels';
import { Avatar, Badge, Button, LevelBadge, Rise } from '@/shared/ui';

import { RespectButton } from './RespectButton';

interface ProfileHeroProps {
  profile: UserProfile;
  own: boolean;
  onEdit: () => void;
}

/** Gradient avatar, name, badges, bio, member since — and the respect / edit action. */
export function ProfileHero({ profile, own, onEdit }: ProfileHeroProps) {
  return (
    <Rise className="relative overflow-hidden rounded-panel border border-line/70 bg-surface shadow-card">
      <div
        aria-hidden
        className="h-24 bg-[radial-gradient(120%_140%_at_85%_0%,var(--color-beam)_0%,transparent_55%),linear-gradient(135deg,var(--color-brand),#1d4f86)]"
      />
      <div className="-mt-11 flex flex-col gap-3 px-5 pb-5">
        <div className="flex items-end justify-between gap-3">
          <Avatar
            id={profile.id}
            name={profile.display_name}
            size={88}
            className="ring-4 ring-surface"
          />
          {own ? (
            <Button variant="secondary" size="sm" icon={Pencil} onClick={onEdit}>
              Изменить
            </Button>
          ) : (
            <RespectButton profile={profile} />
          )}
        </div>
        <div className="min-w-0">
          <h2 className="font-display text-2xl leading-tight font-semibold [overflow-wrap:anywhere] text-ink">
            {profile.display_name}
          </h2>
          <p className="text-sm text-ink-soft">@{profile.username}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <LevelBadge level={profile.level} size="md" />
          {profile.role !== 'user' && (
            <Badge tone="official" icon={ShieldCheck} size="md">
              {ROLE_LABELS[profile.role]}
            </Badge>
          )}
        </div>
        {profile.bio && (
          <p className="text-base [overflow-wrap:anywhere] whitespace-pre-line text-ink">
            {profile.bio}
          </p>
        )}
        <p className="flex items-center gap-1.5 text-sm text-ink-soft">
          <CalendarHeart size={15} aria-hidden className="text-ink-faint" />
          На «Маяке» с {formatDate(profile.created_at)}
        </p>
      </div>
    </Rise>
  );
}
