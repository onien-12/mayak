import {
  Download,
  Ellipsis,
  Flag,
  Heart,
  Pencil,
  Printer,
  Share2,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { requireAuth, useAuth } from '@/features/auth';
import { ComplaintDialog } from '@/features/places';
import type { RouteDetail } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { formatNumber } from '@/shared/lib/format';
import {
  ConfirmDialog,
  Dropdown,
  DropdownItem,
  DropdownSeparator,
  IconButton,
  Pop,
  PRESS_SCALE,
  TWEEN,
} from '@/shared/ui';

import { downloadGpxWithToast, shareRoute } from '../lib/share';
import { useDeleteRoute, useSaveRoute } from '../useRoute';

interface TileProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  active?: boolean;
  busy?: boolean;
  /** Full accessible name when the visible label is short. */
  hint?: string;
}

function ActionTile({ icon: Icon, label, onClick, active = false, busy = false, hint }: TileProps) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: PRESS_SCALE }}
      transition={TWEEN.fast}
      onClick={onClick}
      disabled={busy}
      aria-pressed={active || undefined}
      aria-label={hint}
      title={hint}
      className={cn(
        'flex min-h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-control border px-1 py-2 text-xs font-medium transition-colors duration-150',
        active
          ? 'border-danger/30 bg-danger-soft text-danger-ink'
          : 'border-line bg-surface text-ink hover:bg-canvas',
        busy && 'opacity-60',
      )}
    >
      <Pop trigger={active}>
        <Icon size={20} aria-hidden className={cn(active && 'fill-danger text-danger')} />
      </Pop>
      <span className="max-w-full truncate">{label}</span>
    </motion.button>
  );
}

/** Someone else's public route that is live in the catalog: it can be saved and reported. */
function useIsOthersPublicRoute(route: RouteDetail): boolean {
  const { user } = useAuth();
  return (
    route.visibility === 'public' &&
    route.author.id !== user?.id &&
    (route.status === 'published' || route.status === 'needs_review')
  );
}

/** Thumb-friendly row: save, share, GPX, print. */
export function RouteActionTiles({ route }: { route: RouteDetail }) {
  const navigate = useNavigate();
  const save = useSaveRoute(route.id);
  const [exporting, setExporting] = useState(false);
  const savable = useIsOthersPublicRoute(route);

  const exportGpx = async () => {
    setExporting(true);
    await downloadGpxWithToast(route);
    setExporting(false);
  };

  return (
    <div className="flex gap-2">
      {savable && (
        <ActionTile
          icon={Heart}
          active={route.is_saved}
          label={route.saves_count > 0 ? formatNumber(route.saves_count) : 'Сохранить'}
          onClick={() =>
            requireAuth(() => save.mutate(!route.is_saved), 'чтобы сохранить маршрут себе')
          }
        />
      )}
      <ActionTile icon={Share2} label="Поделиться" onClick={() => void shareRoute(route)} />
      <ActionTile
        icon={Download}
        label="GPX"
        hint="Скачать GPX-трек"
        busy={exporting}
        onClick={() => void exportGpx()}
      />
      <ActionTile
        icon={Printer}
        label="Печать"
        hint="Печать или сохранение в PDF"
        onClick={() => navigate(`/routes/${route.id}/print`)}
      />
    </div>
  );
}

/** Header menu: edit and delete for the author or a moderator, a complaint for everyone else. */
export function RouteMenu({ route }: { route: RouteDetail }) {
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<'delete' | 'complaint' | null>(null);
  const remove = useDeleteRoute(route.id, () => navigate('/routes', { replace: true }));
  const reportable = useIsOthersPublicRoute(route);

  if (!route.can_edit && !reportable) return null;

  return (
    <>
      <Dropdown
        label="Действия с маршрутом"
        trigger={(props) => <IconButton {...props} icon={Ellipsis} label="Ещё" />}
      >
        {route.can_edit && (
          <>
            <DropdownItem icon={Pencil} onSelect={() => navigate(`/routes/${route.id}/edit`)}>
              Редактировать
            </DropdownItem>
            <DropdownItem icon={Trash2} danger onSelect={() => setDialog('delete')}>
              Удалить
            </DropdownItem>
          </>
        )}
        {route.can_edit && reportable && <DropdownSeparator />}
        {reportable && (
          <DropdownItem
            icon={Flag}
            onSelect={() => requireAuth(() => setDialog('complaint'), 'чтобы пожаловаться')}
          >
            Пожаловаться
          </DropdownItem>
        )}
      </Dropdown>
      <ComplaintDialog
        open={dialog === 'complaint'}
        onClose={() => setDialog(null)}
        targetType="route"
        targetId={route.id}
      />
      <ConfirmDialog
        open={dialog === 'delete'}
        onClose={() => setDialog(null)}
        onConfirm={() => remove.mutate()}
        title="Удалить маршрут?"
        description="Он исчезнет из каталога и у тех, кто сохранил его себе. Это действие нельзя отменить."
        confirmLabel="Удалить"
        danger
        loading={remove.isPending}
      />
    </>
  );
}
