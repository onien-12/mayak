import {
  Backpack,
  CircleHelp,
  Gem,
  IdCard,
  KeyRound,
  PackageCheck,
  PawPrint,
  Search,
  Shirt,
  Smartphone,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

import type { LostCategory, LostKind, LostRadius, LostState } from '@/shared/api';
import { formatDate } from '@/shared/lib/format';

interface CategoryMeta {
  label: string;
  icon: LucideIcon;
}

export const LOST_CATEGORY_META: Record<LostCategory, CategoryMeta> = {
  documents: { label: 'Документы', icon: IdCard },
  keys: { label: 'Ключи', icon: KeyRound },
  phone: { label: 'Телефон и техника', icon: Smartphone },
  wallet: { label: 'Кошелёк и карты', icon: Wallet },
  bag: { label: 'Сумка или рюкзак', icon: Backpack },
  clothes: { label: 'Одежда', icon: Shirt },
  jewelry: { label: 'Украшения и часы', icon: Gem },
  pet: { label: 'Животное', icon: PawPrint },
  other: { label: 'Другое', icon: CircleHelp },
};

export const LOST_CATEGORIES = Object.keys(LOST_CATEGORY_META) as LostCategory[];

interface KindMeta {
  /** Filter and badge: «Нашли» / «Потеряли». */
  label: string;
  /** «Найдено 12 ноября» / «Потеряно 12 ноября». */
  happened: string;
  icon: LucideIcon;
  /** Pin colour — neither a layer colour nor the navy of place clusters. */
  color: string;
  /** Tinted badge classes. */
  soft: string;
}

export const LOST_KIND_META: Record<LostKind, KindMeta> = {
  found: {
    label: 'Нашли',
    happened: 'Найдено',
    icon: PackageCheck,
    color: '#1f9d55',
    soft: 'bg-success-soft text-success-ink',
  },
  lost: {
    label: 'Потеряли',
    happened: 'Потеряно',
    icon: Search,
    color: '#d6336c',
    soft: 'bg-[#fde8ef] text-[#a3194d]',
  },
};

export const LOST_STATE_LABELS: Record<Exclude<LostState, 'active'>, string> = {
  returned: 'Вернули хозяину',
  expired: 'Объявление устарело',
};

export const RADIUS_OPTIONS: readonly { value: LostRadius | null; label: string }[] = [
  { value: 300, label: '300 м' },
  { value: 1000, label: '1 км' },
  { value: 3000, label: '3 км' },
  { value: null, label: 'Не знаю где' },
];

export function radiusLabel(radius: LostRadius | null): string {
  if (radius === null) return 'где — не знает, по всему городу';
  return `в радиусе ${radius >= 1000 ? `${radius / 1000} км` : `${radius} м`}`;
}

/** `YYYY-MM-DD` of a local day — the value of `<input type="date">`. */
export function toDayValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function daysAgoValue(days: number, now = new Date()): string {
  return toDayValue(new Date(now.getFullYear(), now.getMonth(), now.getDate() - days));
}

/** «Найдено 12 ноября». */
export function happenedLabel(kind: LostKind, day: string): string {
  return `${LOST_KIND_META[kind].happened} ${formatDate(`${day}T12:00:00`)}`;
}

/** Documents are the one category where people tend to publish too much. */
export const DOCUMENTS_HINT =
  'Пишите только имя и первую букву фамилии («паспорт на имя Ивана С.»). Не публикуйте номера ' +
  'документов и фото разворота — это увидят все. Хозяин сам назовёт подробности в отклике.';
