import { useEffect, useRef } from 'react';

import {
  MapTapPin,
  useMapActions,
  useMapObjectHighlight,
  useSpotParam,
  type MapTap,
} from '@/features/map';
import { pluralize } from '@/shared/lib/format';
import { PanelLayout, Rise, Skeleton, usePanelStore } from '@/shared/ui';

import { NearbyPlaces } from './NearbyPlaces';
import { NoteComposer } from './NoteComposer';
import { NotesThread } from './NotesThread';
import { SpotActions } from './SpotActions';
import { SpotFacts } from './SpotFacts';
import { NOTE_FORMS, useSpotNotes } from './useNotes';
import { useSpotInfo, useSpotOutage } from './useSpotInfo';

function SpotBody({ spot, onClose }: { spot: MapTap; onClose: () => void }) {
  const thread = useSpotNotes(spot);
  const knownName = thread.notes.data?.find((note) => note.object_name)?.object_name ?? null;
  const info = useSpotInfo(spot, knownName);
  const outage = useSpotOutage(spot);
  const composer = useRef<HTMLTextAreaElement>(null);
  const setSnap = usePanelStore((state) => state.setSnap);
  const { flyTo, ready } = useMapActions();
  const { lat, lng } = spot;

  useEffect(() => {
    if (ready) flyTo({ lat, lng });
  }, [ready, lat, lng, flyTo]);

  const writeNote = () => {
    setSnap('full');
    composer.current?.focus();
  };

  const count = thread.notes.data?.filter((note) => note.id > 0).length;
  const subtitle =
    count === undefined
      ? 'Точка на карте'
      : count > 0
        ? `${pluralize(count, NOTE_FORMS)} жителей`
        : 'Заметок пока нет — оставьте первую';

  return (
    <PanelLayout
      title={
        info.isResolving ? <Skeleton className="my-1 h-5 w-48" /> : (info.title ?? 'Точка на карте')
      }
      subtitle={subtitle}
      onBack={onClose}
      backLabel="Закрыть"
      footer={
        <NoteComposer
          spot={spot}
          objectName={info.title}
          create={thread.create}
          inputRef={composer}
        />
      }
    >
      <MapTapPin position={spot} />
      <Rise className="flex flex-col gap-6">
        <SpotFacts spot={spot} info={info} outage={outage} />
        <SpotActions
          spot={spot}
          address={info.address ?? info.title}
          objectName={info.title}
          onWriteNote={writeNote}
        />
        <NotesThread thread={thread} onWrite={writeNote} />
        <NearbyPlaces spot={spot} />
      </Rise>
    </PanelLayout>
  );
}

/**
 * The spot sheet (`?at=<lat>,<lng>&obj=<2gis id>`, SPEC §13): any tapped point or 2GIS
 * object — what it is, residents' notes about it, what the map already knows nearby, and
 * the fastest ways to contribute.
 */
export default function SpotSheet() {
  const { spot, closeSpot } = useSpotParam();
  useMapObjectHighlight(spot?.objectId);

  if (!spot) return null;

  return (
    <SpotBody
      key={`${spot.lat},${spot.lng},${spot.objectId ?? ''}`}
      spot={spot}
      onClose={closeSpot}
    />
  );
}
