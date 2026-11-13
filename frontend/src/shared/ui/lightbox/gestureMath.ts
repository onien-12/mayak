export interface Point {
  x: number;
  y: number;
}

export type Gesture =
  | { kind: 'idle' }
  | { kind: 'press'; start: Point; at: number; onImage: boolean }
  | { kind: 'swipe'; start: Point }
  | { kind: 'pull'; start: Point }
  | { kind: 'pan'; start: Point; from: Point }
  | { kind: 'pinch'; distance: number; scale: number; anchor: Point };

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
/** Past the limit the content follows the finger at a third of the distance. */
export const rubber = (offset: number, limit: number) =>
  Math.abs(offset) <= limit ? offset : Math.sign(offset) * (limit + (Math.abs(offset) - limit) / 3);

/** Finger speed over the last 100 ms, px/s — decides flicks and the pan's glide. */
export class VelocityTracker {
  private samples: (Point & { t: number })[] = [];

  reset() {
    this.samples = [];
  }

  add(point: Point) {
    const t = performance.now();
    this.samples = [...this.samples.filter((item) => t - item.t < 100), { ...point, t }];
  }

  velocity(): Point {
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    if (!first || !last || last.t === first.t) return { x: 0, y: 0 };
    const seconds = (last.t - first.t) / 1000;
    return { x: (last.x - first.x) / seconds, y: (last.y - first.y) / seconds };
  }
}
