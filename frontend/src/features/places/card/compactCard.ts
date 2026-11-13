import type { PlaceDetail } from '@/shared/api';

/** Events keep their card short: the secondary blocks of other layers live in the card menu. */
export const hasCompactCard = (place: PlaceDetail) => place.layer === 'event';
