import { requireAuth } from '@/features/auth';
import { openCreatePlace, type PlaceEditorPreset } from '@/features/places';
import { FORMAT_SLUGS } from '@/shared/lib/eventFormats';

/** What a resident sets out to arrange (SPEC §3.4); a venue is a place, not an event. */
export type CreateKind = 'meetup' | 'swap' | 'help' | 'event' | 'venue';

const STARTS: Record<CreateKind, { preset: PlaceEditorPreset; reason: string }> = {
  meetup: { preset: { layer: 'event', isMeetup: true }, reason: 'чтобы собрать встречу' },
  swap: {
    preset: { layer: 'event', isMeetup: true, categorySlug: FORMAT_SLUGS.swap },
    reason: 'чтобы устроить раздачу',
  },
  help: {
    preset: { layer: 'event', isMeetup: true, categorySlug: FORMAT_SLUGS.help },
    reason: 'чтобы попросить о помощи',
  },
  event: { preset: { layer: 'event', isMeetup: false }, reason: 'чтобы добавить событие' },
  venue: {
    preset: { layer: 'infrastructure', categorySlug: FORMAT_SLUGS.venue },
    reason: 'чтобы предложить площадку',
  },
};

/** Opens the create wizard with the steps the chosen format answers (layer, category) skipped. */
export function startCreateEvent(kind: CreateKind): void {
  const { preset, reason } = STARTS[kind];
  requireAuth(() => openCreatePlace(preset), reason);
}
