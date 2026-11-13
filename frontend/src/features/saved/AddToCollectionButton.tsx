import { BookmarkCheck, BookmarkPlus } from 'lucide-react';
import { useState } from 'react';

import { requireAuth, useAuth } from '@/features/auth';
import type { PlaceCard } from '@/shared/api';
import { IconButton, Popover } from '@/shared/ui';

import { CollectionPicker } from './CollectionPicker';
import { usePlaceMembership } from './usePlaceMembership';

interface AddToCollectionButtonProps {
  /** The place to add — a `PlaceCard` or the card's `PlaceDetail`. */
  place: PlaceCard;
  className?: string;
}

/**
 * «Добавить в подборку»: icon button that opens my collections with checkmarks (popover on
 * desktop, action sheet on phones). Anonymous visitors are asked to sign in first.
 */
export function AddToCollectionButton({ place, className }: AddToCollectionButtonProps) {
  const { isAuthenticated } = useAuth();
  const { saved } = usePlaceMembership(place, isAuthenticated);
  const [open, setOpen] = useState(false);
  const label = saved ? 'В подборке · изменить' : 'Добавить в подборку';

  return (
    <Popover
      label="Добавить в подборку"
      placement="bottom-end"
      open={open}
      onOpenChange={setOpen}
      trigger={(props) => (
        <IconButton
          {...props}
          onClick={() => requireAuth(() => setOpen(!open), 'чтобы собирать подборки')}
          icon={saved ? BookmarkCheck : BookmarkPlus}
          label={label}
          active={saved}
          className={className}
        />
      )}
    >
      <CollectionPicker place={place} />
    </Popover>
  );
}
