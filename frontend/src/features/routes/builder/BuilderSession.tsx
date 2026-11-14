import { History } from 'lucide-react';
import { useCallback, useEffect, useEffectEvent, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { useMapActions } from '@/features/map';
import type { RouteDetail } from '@/shared/api';
import { formatRelative, pluralize } from '@/shared/lib/format';
import { boundsOfPoints } from '@/shared/lib/geo';
import { Banner, Button } from '@/shared/ui';

import { DraftStatus } from '../drafts/DraftStatus';
import { LeaveDialog } from '../drafts/LeaveDialog';
import type { StoredDraft } from '../drafts/storage';
import { ROUTE_PLURALS } from '../lib/plurals';
import { BuilderDone } from './BuilderDone';
import { BuilderMapLayer } from './BuilderMapLayer';
import { DetailsStep } from './DetailsStep';
import { visibleCount, type RouteDraft } from './model';
import { PointsStep } from './PointsStep';
import { StopEditor } from './StopEditor';
import { useBuilderStore } from './store';
import { useAccountDraft } from './useAccountDraft';
import { clearStoredDraft, useDraftAutosave } from './useDraftAutosave';
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
  stored: StoredDraft<RouteDraft>;
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

/** One visit to the builder: steps, map layer, stop editor, drafts and the leave guard. */
export function BuilderSession({ initial, routeId }: BuilderSessionProps) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const resume = params.get('draft') === '1';
  const [sessionId] = useState(nextSessionId);
  const active = useBuilderStore((state) => state.sessionId === sessionId);
  const step = useBuilderStore((state) => state.step);
  const draft = useBuilderStore((state) => state.draft);
  const dirty = useBuilderStore((state) => state.dirty);
  const editing = useBuilderStore((state) => state.editingId !== null);
  const [saved, setSaved] = useState<RouteDetail | null>(null);
  const [movedTo, setMovedTo] = useState<number | null>(null);
  const autosave = useDraftAutosave(routeId);
  const { restore, clear, flush, device } = autosave;
  const { fitBounds } = useMapActions();
  const preview = useRoutePreview(draft);
  const blocker = useLeaveGuard(active && dirty && saved === null && movedTo === null, {
    unloadWarning: device.failed,
  });
  const title = routeId === null ? 'Новый маршрут' : 'Редактирование';
  const account = useAccountDraft({
    routeId,
    saved: routeId === null ? null : initial.visibility,
    onStored: clear,
    onCreated: setMovedTo,
  });

  // «Продолжить» in «Черновики»: the device copy is the work, no second question.
  const resumeDraft = useEffectEvent(() => {
    if (!resume) return;
    const bounds = boundsOfPoints(restore()?.stops ?? []);
    if (bounds) fitBounds(bounds);
  });

  useEffect(() => {
    useBuilderStore.getState().start(sessionId, initial);
    resumeDraft();
  }, [sessionId, initial]);

  // A new route saved as an account draft: go on editing it there (after the guard is off).
  useEffect(() => {
    if (movedTo !== null) navigate(`/routes/${movedTo}/edit`, { replace: true });
  }, [movedTo, navigate]);

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
  const status = <DraftStatus device={device} touched={dirty} account={account} />;

  return (
    <>
      <BuilderMapLayer path={preview.path} interactive={step === 'points' && !editing} />
      {step === 'points' ? (
        <PointsStep
          title={title}
          preview={preview}
          onClose={close}
          notice={
            <>
              {autosave.stored && !dirty && (
                <RestorePrompt
                  stored={autosave.stored}
                  onRestore={() => {
                    const bounds = boundsOfPoints(restore()?.stops ?? []);
                    if (bounds) fitBounds(bounds);
                  }}
                  onDiscard={autosave.discard}
                />
              )}
              {status}
            </>
          }
        />
      ) : (
        <DetailsStep
          title={title}
          routeId={routeId}
          preview={preview}
          onSaved={onSaved}
          notice={status}
        />
      )}
      <StopEditor />
      <LeaveDialog
        blocker={blocker}
        flush={flush}
        failed={device.failed}
        title="Выйти из конструктора?"
      />
    </>
  );
}
