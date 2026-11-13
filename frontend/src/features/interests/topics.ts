import {
  Baby,
  Bike,
  Building2,
  Coffee,
  Gem,
  GraduationCap,
  Landmark,
  Music,
  Palette,
  PartyPopper,
  Sunset,
  Trees,
  Waves,
  type LucideIcon,
} from 'lucide-react';

import type { Topic, TopicSlug } from '@/shared/api';
import type { Tone } from '@/shared/lib/tones';

export interface TopicMeta extends Topic {
  icon: LucideIcon;
  tone: Tone;
}

/**
 * The catalogue of SPEC §23.1 in display order, with the built-in Russian labels — used as
 * they are until (and whenever) `GET /interests/topics` cannot be read.
 */
export const TOPIC_META: Record<TopicSlug, TopicMeta> = {
  sea: {
    slug: 'sea',
    label: 'Море и берег',
    description: 'набережные, пляжи, бухты, маяки, острова, яхты',
    icon: Waves,
    tone: 'official',
  },
  views: {
    slug: 'views',
    label: 'Виды и панорамы',
    description: 'смотровые, сопки, закаты, мосты',
    icon: Sunset,
    tone: 'tourism',
  },
  history: {
    slug: 'history',
    label: 'История',
    description: 'форты, батареи, памятники, старый город',
    icon: Landmark,
    tone: 'warning',
  },
  architecture: {
    slug: 'architecture',
    label: 'Архитектура',
    description: 'здания, кварталы, мосты как сооружения',
    icon: Building2,
    tone: 'brand',
  },
  nature: {
    slug: 'nature',
    label: 'Природа и тропы',
    description: 'парки, леса, тропы, ботаника',
    icon: Trees,
    tone: 'success',
  },
  art: {
    slug: 'art',
    label: 'Искусство и культура',
    description: 'музеи, театры, галереи, выставки',
    icon: Palette,
    tone: 'event',
  },
  music: {
    slug: 'music',
    label: 'Музыка',
    description: 'концерты, фестивали, джаз, клубные вечера',
    icon: Music,
    tone: 'event',
  },
  food: {
    slug: 'food',
    label: 'Еда и кофе',
    description: 'кафе, рынки, гастрономия',
    icon: Coffee,
    tone: 'tourism',
  },
  sport: {
    slug: 'sport',
    label: 'Спорт и движение',
    description: 'площадки, пробежки, игры, йога',
    icon: Bike,
    tone: 'infrastructure',
  },
  family: {
    slug: 'family',
    label: 'С детьми',
    description: 'детские площадки, мастер-классы и спектакли для детей',
    icon: Baby,
    tone: 'beam',
  },
  learning: {
    slug: 'learning',
    label: 'Лекции и мастерские',
    description: 'лекции, мастер-классы, библиотеки, экскурсии',
    icon: GraduationCap,
    tone: 'official',
  },
  fun: {
    slug: 'fun',
    label: 'Развлечения',
    description: 'шоу, квизы, вечеринки, аттракционы',
    icon: PartyPopper,
    tone: 'beam',
  },
  unusual: {
    slug: 'unusual',
    label: 'Необычное',
    description: 'нишевые, странные, «для своих» места',
    icon: Gem,
    tone: 'neutral',
  },
};

export const TOPIC_SLUGS = Object.keys(TOPIC_META) as TopicSlug[];

export const isTopicSlug = (value: unknown): value is TopicSlug =>
  typeof value === 'string' && value in TOPIC_META;

/** Known slugs only, without duplicates, in catalogue order. */
export function orderTopics(topics: readonly unknown[]): TopicSlug[] {
  return TOPIC_SLUGS.filter((slug) => topics.includes(slug));
}

/** Recommended (not required) size of a profile for the picker. */
export const RECOMMENDED_TOPICS = 3;
