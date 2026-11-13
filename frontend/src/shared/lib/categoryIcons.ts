import {
  Accessibility,
  Armchair,
  ArrowUpDown,
  Baby,
  BatteryCharging,
  Binoculars,
  BriefcaseMedical,
  Building2,
  CircleDot,
  Construction,
  Cross,
  DoorOpen,
  Drama,
  Droplets,
  Dumbbell,
  Footprints,
  Gift,
  Goal,
  GraduationCap,
  HandHelping,
  HeartPulse,
  Landmark,
  LibraryBig,
  Megaphone,
  Palette,
  PartyPopper,
  Plug,
  Presentation,
  ShowerHead,
  Shovel,
  Sparkles,
  SquareParking,
  Table2,
  Toilet,
  ToyBrick,
  TreePine,
  Trees,
  TriangleAlert,
  Trophy,
  Utensils,
  Volleyball,
  Waves,
  Wifi,
  type LucideIcon,
} from 'lucide-react';

import type { Category, Layer } from '../api/types';
import { LAYER_META } from './labels';

/** Seed category slug → icon (SPEC §9). Unknown slugs fall back to the layer icon. */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  // infrastructure
  toilet: Toilet,
  shower: ShowerHead,
  baby_room: Baby,
  drinking_water: Droplets,
  first_aid: Cross,
  defibrillator: HeartPulse,
  first_aid_kit: BriefcaseMedical,
  ramp: Accessibility,
  elevator: ArrowUpDown,
  accessible_crossing: Footprints,
  accessible_parking: SquareParking,
  accessible_entrance: DoorOpen,
  public_space: Trees,
  rest_place: Armchair,
  charging: BatteryCharging,
  wifi: Wifi,
  library: LibraryBig,
  venue: Presentation,
  sports_ground: Dumbbell,
  basketball: Volleyball,
  football: Goal,
  skatepark: Waves,
  workout: Dumbbell,
  table_tennis: Table2,
  playground: ToyBrick,
  // event
  culture: Drama,
  city: Megaphone,
  sport: Trophy,
  education: GraduationCap,
  entertainment: PartyPopper,
  swap: Gift,
  help: HandHelping,
  // tourism
  historic: Landmark,
  architecture: Building2,
  food: Utensils,
  nature: TreePine,
  viewpoint: Binoculars,
  unusual: Sparkles,
  culture_space: Palette,
  // issue
  utilities: Plug,
  roads: Construction,
  improvement: Shovel,
  hazard: TriangleAlert,
  public_space_issue: CircleDot,
};

export function categoryIcon(slug: string | undefined, layer: Layer): LucideIcon {
  return (slug && CATEGORY_ICONS[slug]) || LAYER_META[layer].icon;
}

/** Categories grouped by their `group`, preserving backend order. */
export function groupCategories(
  categories: readonly Category[],
): [group: string, items: Category[]][] {
  const groups = new Map<string, Category[]>();
  for (const category of categories) {
    const items = groups.get(category.group);
    if (items) items.push(category);
    else groups.set(category.group, [category]);
  }
  return [...groups.entries()];
}
