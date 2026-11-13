import { History } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';

import { useMapActions } from '@/features/map';
import type { RouteDetail } from '@/shared/api';
import { formatRelative, pluralize } from '@/shared/lib/format';
import { boundsOfPoints } from '@/shared/lib/geo';
import { Banner, Button, ConfirmDialog } from '@/shared/ui';

import { ROUTE_PLURALS } from '../lib/plurals';
import { BuilderDone } from './BuilderDone';
import { BuilderMapLayer } from './BuilderMapLayer';
import { DetailsStep } from './DetailsStep';
import { visibleCount, type RouteDraft } from './model';
import { PointsStep } from './PointsStep';
import { StopEditor } from './StopEditor';
import { useBuilderStore } from './store';
import { clearStoredDraft, useDraftAutosave, type StoredDraft } from './useDraftAutosave';
import { useLeaveGuard } from './useLeaveGuard';
import { useRoutePreview } from './useRoutePreview';

let sessions = 0;
const nextSessionId = () => {
  sessions += 1;
  return sessions;
};

function RestorePrompt({
  stored,
  onRestore,
  onDiscard,
}: {
  stored: StoredDraft;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  return (
    <Banner
      tone="beam"
      icon={History}
      title="Есть несохранённый черновик"
      action={
        <div className="flex gap-2">
          <Button size="sm" onClick={onRestore}>
            Продолжить
          </Button>
          <Button size="sm" variant="ghost" onClick={onDiscard}>
            Начать заново
          </Button>
        </div>
      }
    >
      {[
        `Изменён ${formatRelative(stored.savedAt)}`,
        pluralize(visibleCount(stored.draft.stops), ROUTE_PLURALS.point),
        stored.draft.title && `«${stored.draft.title}»`,
      ]
        .filter(Boolean)
        .join(' · ')}
    </Banner>
  );
}

interface BuilderSessionProps {
  initial: RouteDraft;
  /** The edited route; `null` when creating. */
  routeId: number | null;
}

/** One visit to the builder: steps, map layer, stop editor, autosave and the leave guard. */
export function BuilderSession({ initial, routeId }: BuilderSessionProps) {
  const navigate = useNavigate();
  const [sessionId] = useState(nextSessionId);
  const active = useBuilderStore((state) => state.sessionId === sessionId);
  const step = useBuilderStore((state) => state.step);
  const draft = useBuilderStore((state) => state.draft);
  const dirty = useBuilderStore((state) => state.dirty);
  const editing = useBuilderStore((state) => state.editingId !== null);
  const [saved, setSaved] = useState<RouteDetail | null>(null);
  const autosave = useDraftAutosave(routeId);
  const { fitBounds } = useMapActions();
  const preview = useRoutePreview(draft);
  const blocker = useLeaveGuard(active && dirty && saved === null);
  const title = routeId === null ? 'Новый маршрут' : 'Редактирование';

  useEffect(() => {
    useBuilderStore.getState().start(sessionId, initial);
  }, [sessionId, initial]);

  const onSaved = useCallback(
    (route: RouteDetail) => {
      clearStoredDraft(routeId);
      setSaved(route);
    },
    [routeId],
  );
  const openSaved = useCallback(() => {
    if (saved) navigate(`/routes/${saved.id}`, { replace: true });
  }, [saved, navigate]);

  if (!active) return null;
  if (saved) return <BuilderDone route={saved} edited={routeId !== null} onOpen={openSaved} />;

  const close = () => navigate(routeId === null ? '/routes' : `/routes/${routeId}`);

  return (
    <>
      <BuilderMapLayer path={preview.path} interactive={step === 'points' && !editing} />
      {step === 'points' ? (
        <PointsStep
          title={title}
          preview={preview}
          onClose={close}
          notice={
            autosave.stored &&
            !dirty && (
              <RestorePrompt
                stored={autosave.stored}
                onRestore={() => {
                  const bounds = boundsOfPoints(autosave.restore()?.stops ?? []);
                  if (bounds) fitBounds(bounds);
                }}
                onDiscard={autosave.discard}
              />
            )
          }
        />
      ) : (
        <DetailsStep title={title} routeId={routeId} preview={preview} onSaved={onSaved} />
      )}
      <StopEditor />
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onClose={() => blocker.reset?.()}
        onConfirm={() => blocker.proceed?.()}
        title="Выйти из конструктора?"
        description="Изменения не сохранены на сервере, но черновик останется на этом устройстве — к нему можно вернуться."
        confirmLabel="Выйти"
        cancelLabel="Остаться"
      />
    </>
  );
}
