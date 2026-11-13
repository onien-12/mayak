import { Landmark, MapPin, Waypoints, type LucideIcon } from 'lucide-react';

import type { BuilderTool } from './store';

export const TOOLS: { tool: BuilderTool; label: string; icon: LucideIcon }[] = [
  { tool: 'stop', label: 'Точка', icon: MapPin },
  { tool: 'via', label: 'Трек', icon: Waypoints },
  { tool: 'places', label: 'Места', icon: Landmark },
];

export const TOOL_HINTS: Record<BuilderTool, string> = {
  stop: 'Нажмите на карту — там появится точка. Её можно перетащить.',
  via: 'Нажмите на линию там, где тропа поворачивает: точка трека уточнит путь.',
  places: 'Нажмите на метку места на карте — оно станет точкой маршрута.',
};
