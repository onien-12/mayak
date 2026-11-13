import type { LucideIcon } from 'lucide-react';

import type { Layer } from '../api/types';
import { cn } from '../lib/cn';
import { LAYER_META } from '../lib/labels';
import { TONES } from '../lib/tones';
import { CategoryGlyph } from './CategoryGlyph';

interface IconTileProps {
  icon: LucideIcon;
  layer: Layer;
  /** Tile side in px; the glyph scales with it. */
  size?: number;
  variant?: 'solid' | 'soft';
  className?: string;
}

function IconTile({ icon: Icon, layer, size = 36, variant = 'soft', className }: IconTileProps) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3) }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center',
        TONES[layer][variant],
        className,
      )}
    >
      <Icon size={Math.round(size * 0.54)} strokeWidth={2.1} />
    </span>
  );
}

type LayerIconProps = Omit<IconTileProps, 'icon'>;

/** Layer glyph on a tile in the layer colour. */
export function LayerIcon(props: LayerIconProps) {
  return <IconTile icon={LAYER_META[props.layer].icon} {...props} />;
}

interface CategoryIconProps extends LayerIconProps {
  /** Category slug; unknown or missing slugs fall back to the layer icon. */
  slug: string | undefined;
}

export function CategoryIcon({
  slug,
  layer,
  size = 36,
  variant = 'soft',
  className,
}: CategoryIconProps) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3) }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center',
        TONES[layer][variant],
        className,
      )}
    >
      <CategoryGlyph slug={slug} layer={layer} size={Math.round(size * 0.54)} strokeWidth={2.1} />
    </span>
  );
}
