import type { PhotoCredit } from '../../api/types';

/**
 * A photo for the viewer. Our `Photo` records fit as they are; a hot-linked photo of another
 * service is just its URL with the `source` to credit.
 */
export interface ViewerPhoto {
  id?: number;
  url: string;
  /** Author and licence of a freely licensed photo. */
  credit?: PhotoCredit | null;
  /** The service a hot-linked photo comes from: «Фото: Яндекс Карты» with a link. */
  source?: { label: string; url: string } | null;
  /** A line under the photo, e.g. the place it shows. */
  caption?: string;
  /** A button under the photo; the viewer closes before running it. */
  action?: { label: string; onSelect: () => void };
}
