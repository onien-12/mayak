import type { AreaCard, TopicSlug } from '@/shared/api';
import { interestLabel, type InterestMeta } from '@/shared/lib/labels';

export interface ShownInterest {
  /** What the viewer sees: the personal value when the server sent one (SPEC §23.4). */
  value: number;
  tier: InterestMeta;
  /** The value is moved towards the viewer — label it «для вас» and keep `base` reachable. */
  personal: boolean;
  /** The general interest (§17), unchanged by personalisation. */
  base: number;
  baseTier: InterestMeta;
  /** Why it is personal: the 1–2 best matching topics (may be empty). */
  reasons: readonly TopicSlug[];
}

/** The interest to show for an area: personal when present, exactly today's otherwise. */
export function shownInterest(area: AreaCard): ShownInterest {
  const personal = area.personal_interest ?? null;
  const value = personal ? personal.value : area.interest;
  return {
    value,
    tier: interestLabel(value),
    personal: personal !== null,
    base: area.interest,
    baseTier: interestLabel(area.interest),
    reasons: personal?.topics ?? [],
  };
}
