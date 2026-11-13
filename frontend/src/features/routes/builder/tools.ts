import { Landmark, MapPin, type LucideIcon } from 'lucide-react';

import type { BuilderTool } from './store';

/**
 * What the author can pick. The `via` tool (points that only bend the line) is not offered:
 * an ordinary point does the same and needs no explaining; routes that already have such
 * points keep them.
 */
export const TOOLS: { tool: BuilderTool; label: string; icon: LucideIcon }[] = [
  { tool: 'stop', label: 'Точка', icon: MapPin },
  { tool: 'places', label: 'Места', icon: Landmark },
];

export const TOOL_HINTS: Record<BuilderTool, string> = {
  stop: 'Нажмите на карту — там появится точка. Её можно перетащить.',
  via: 'Нажмите на линию там, где тропа поворачивает: промежуточная точка уточнит путь.',
  places: 'Нажмите на метку места на карте — оно станет точкой маршрута.',
};
