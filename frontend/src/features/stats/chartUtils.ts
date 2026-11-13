/** «53 %» — share of `part` in `total`, safe for an empty total; a tiny non-zero share is «<1 %». */
export function formatShare(part: number, total: number): string {
  const percent = total > 0 ? Math.round((part / total) * 100) : 0;
  return `${percent === 0 && part > 0 ? '<1' : percent}\u00a0%`;
}

/** SVG path of a donut segment between two angles (radians, 0 = 12 o'clock, clockwise). */
export function arcPath(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  start: number,
  end: number,
): string {
  const point = (radius: number, angle: number) =>
    `${cx + radius * Math.sin(angle)} ${cy - radius * Math.cos(angle)}`;
  const large = end - start > Math.PI ? 1 : 0;
  return [
    `M ${point(outer, start)}`,
    `A ${outer} ${outer} 0 ${large} 1 ${point(outer, end)}`,
    `L ${point(inner, end)}`,
    `A ${inner} ${inner} 0 ${large} 0 ${point(inner, start)}`,
    'Z',
  ].join(' ');
}

/** A clean axis maximum ≥ `value`: 1, 2, 5 × 10ⁿ. */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((factor) => factor * magnitude >= value) ?? 10;
  return step * magnitude;
}
