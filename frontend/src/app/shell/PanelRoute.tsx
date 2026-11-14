import { AnimatePresence, motion } from 'motion/react';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Outlet } from 'react-router';

import { AreaEditorPanel, AreaPanel, useAreaAwareTap, useAreaEditor } from '@/features/areas';
import { useAreaParam, useMapStack, useMapTap, usePlaceParam, useSpotParam } from '@/features/map';
import { PlaceEditorPanel, PlacePanel, PlaceStackPanel, usePlaceEditor } from '@/features/places';
import { ObjectNotesPreview } from '@/features/spot';
import { useIsDesktop } from '@/shared/hooks';
import { ListSkeleton, PanelSectionContext, pushVariants, usePanelStore } from '@/shared/ui';

import { SpotSheet } from '../sections';
import { BottomSheet } from './BottomSheet';
import { SheetFloating } from './MapChrome';
import { SidePanel } from './SidePanel';

/** Where the panel content is shown: the side panel or the bottom sheet adopts the content node. */
function PanelSlot({ host }: { host: HTMLElement }) {
  // A stable ref: an inline one would detach and re-attach the content on every render of the
  // route, and a re-attached node loses the scroll position of everything inside it.
  const adopt = useCallback(
    (slot: HTMLDivElement | null) => {
      slot?.append(host);
      return () => {
        if (host.parentElement === slot) host.remove();
      };
    },
    [host],
  );
  return <div ref={adopt} className="h-full rounded-[inherit]" />;
}

function PanelFallback() {
  return (
    <div className="p-4 lg:p-5">
      <ListSkeleton rows={6} />
    </div>
  );
}

/**
 * Layout route of all panel sections. The section stays mounted underneath while the place
 * or area editor, the place card (`?place=<id>`), the list of places at one point
 * (`?stack=<lat>,<lng>`), the area card (`?area=<id>`) or the spot sheet (`?at=<lat>,<lng>`)
 * is pushed on top of it, so its state, scroll position and map markers survive. A place
 * opened from an area or from such a list keeps the parameter, so closing it returns there.
 *
 * The content is rendered into its own DOM node that the side panel (desktop) or the bottom
 * sheet (phone) adopts: crossing the breakpoint — a rotated phone, opened developer tools —
 * moves the node instead of remounting everything, so a half-filled form survives.
 */
export function PanelRoute() {
  const isDesktop = useIsDesktop();
  const [host] = useState(() => {
    const node = document.createElement('div');
    node.className = 'h-full rounded-[inherit]';
    return node;
  });
  const { placeId } = usePlaceParam();
  const { areaId } = useAreaParam();
  const stacked = useMapStack().places.length > 0;
  const { spot, openSpot } = useSpotParam();
  const editing = usePlaceEditor((state) => state.session !== null);
  const editingArea = useAreaEditor((state) => state.session !== null);
  const reveal = usePanelStore((state) => state.reveal);
  const overlayKey = editing
    ? 'editor'
    : editingArea
      ? 'area-editor'
      : placeId !== null
        ? `place-${placeId}`
        : stacked
          ? 'stack'
          : areaId !== null
            ? `area-${areaId}`
            : spot
              ? 'spot'
              : null;
  const covered = overlayKey !== null;
  const section = useMemo(() => ({ covered }), [covered]);

  useMapTap(useAreaAwareTap(openSpot), !editing && !editingArea);

  useEffect(() => {
    if (overlayKey !== null) reveal();
  }, [overlayKey, reveal]);

  const content = (
    <div className="relative h-full">
      <div inert={covered} className="isolate h-full">
        <PanelSectionContext value={section}>
          <Suspense fallback={<PanelFallback />}>
            <Outlet />
          </Suspense>
        </PanelSectionContext>
      </div>
      <AnimatePresence initial={false}>
        {covered && (
          <motion.div
            key={overlayKey}
            variants={pushVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="absolute inset-0 z-10 rounded-[inherit] bg-surface"
          >
            {editing ? (
              <PlaceEditorPanel />
            ) : editingArea ? (
              <AreaEditorPanel />
            ) : placeId !== null ? (
              <PlacePanel placeId={placeId} />
            ) : stacked ? (
              <PlaceStackPanel />
            ) : areaId !== null ? (
              <AreaPanel
                areaId={areaId}
                renderNotes={(target) => <ObjectNotesPreview {...target} />}
              />
            ) : (
              <Suspense fallback={<PanelFallback />}>
                <SpotSheet />
              </Suspense>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  const slot = <PanelSlot host={host} />;
  return (
    <>
      {createPortal(content, host)}
      {isDesktop ? (
        <SidePanel>{slot}</SidePanel>
      ) : (
        <BottomSheet floating={<SheetFloating />}>{slot}</BottomSheet>
      )}
    </>
  );
}
