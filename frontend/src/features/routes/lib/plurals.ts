/** Plural forms used only by routes (the shared ones live in `@/shared/lib/format`). */
export const ROUTE_PLURALS = {
  point: ['точка', 'точки', 'точек'],
} as const satisfies Record<string, readonly [string, string, string]>;
