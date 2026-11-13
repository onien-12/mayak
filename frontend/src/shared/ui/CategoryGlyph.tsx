import type { LucideProps } from 'lucide-react';
import { createElement } from 'react';

import type { Layer } from '../api/types';
import { categoryIcon } from '../lib/categoryIcons';

interface CategoryGlyphProps extends LucideProps {
  /** Category slug; unknown or missing slugs fall back to the layer icon. */
  slug: string | undefined;
  layer: Layer;
}

/** The bare lucide glyph of a category (no tile). */
export function CategoryGlyph({ slug, layer, ...props }: CategoryGlyphProps) {
  return createElement(categoryIcon(slug, layer), { 'aria-hidden': true, ...props });
}
