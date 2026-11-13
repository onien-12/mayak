import type { Layer } from '@/shared/api';
import { LAYER_META, LAYERS } from '@/shared/lib/labels';

/** Conic gradient showing the share of each layer inside a cluster. */
function layerRing(layers: readonly Layer[]): string {
  const total = layers.length || 1;
  const stops: string[] = [];
  let from = 0;
  for (const layer of LAYERS) {
    const share = (layers.filter((item) => item === layer).length / total) * 360;
    if (share === 0) continue;
    stops.push(`${LAYER_META[layer].color} ${from}deg ${from + share}deg`);
    from += share;
  }
  return `conic-gradient(${stops.join(', ')})`;
}

function clusterSize(count: number): number {
  if (count < 10) return 40;
  if (count < 50) return 46;
  return 52;
}

/** The bubble under a pin is smaller: the pin is the main thing at that spot. */
const UNDER_PIN_SIZE = 32;
const UNDER_PIN_GAP = 3;

function bubble(size: number, label: string, layers: readonly Layer[]): string {
  const inner = size - (size < 40 ? 8 : 10);
  return (
    `<div data-map-marker="cluster" class="flex cursor-pointer items-center justify-center rounded-full border-2 border-white shadow-pin transition-transform duration-150 hover:scale-110" ` +
    `style="width:${size}px;height:${size}px;background:${layerRing(layers)}">` +
    `<div class="flex items-center justify-center rounded-full bg-brand ${size < 40 ? 'text-xs' : 'text-sm'} font-semibold text-white" ` +
    `style="width:${inner}px;height:${inner}px">${label}</div></div>`
  );
}

/** Navy count bubble with a ring coloured by the layers it contains. */
export function clusterStyle(count: number, layers: readonly Layer[]) {
  const size = clusterSize(count);
  return {
    type: 'html' as const,
    html: bubble(size, String(count), layers),
    anchor: [size / 2, size / 2],
    preventMapInteractions: false,
  };
}

/**
 * Bubble of several places at one point. On its own it looks like a cluster; when one place
 * of the spot is drawn as a pin, the rest hang right under the pin's tip as «+N».
 */
export function stackStyle(count: number, layers: readonly Layer[], underPin: boolean) {
  if (!underPin) return clusterStyle(count, layers);
  return {
    html: bubble(UNDER_PIN_SIZE, `+${count}`, layers),
    anchor: [UNDER_PIN_SIZE / 2, -UNDER_PIN_GAP],
  };
}
