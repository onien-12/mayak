import {
  Archive,
  Armchair,
  Award,
  BadgeCheck,
  Ban,
  Bell,
  Bike,
  Binoculars,
  BookOpen,
  Bot,
  Building2,
  Bus,
  CalendarClock,
  CalendarDays,
  CalendarX,
  Camera,
  Car,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleHelp,
  CircleX,
  Clock,
  Compass,
  Copy,
  Droplet,
  Droplets,
  Eye,
  EyeOff,
  FileWarning,
  Flag,
  Flame,
  Footprints,
  Globe,
  Gavel,
  GraduationCap,
  Hammer,
  Heart,
  History,
  Hourglass,
  ImageOff,
  Landmark,
  LandPlot,
  Lock,
  MapPin,
  MapPinned,
  MessageCircle,
  MessageCircleQuestion,
  Mountain,
  Newspaper,
  PackageSearch,
  Pencil,
  Radio,
  RotateCcw,
  Route,
  Sailboat,
  Scale,
  Send,
  ShieldAlert,
  ShieldCheck,
  Signal,
  SignalHigh,
  SignalMedium,
  Signpost,
  Sparkles,
  Spline,
  Sprout,
  Tent,
  ThumbsUp,
  Trash2,
  TreePalm,
  Trees,
  TrendingUp,
  TriangleAlert,
  UserPlus,
  Users,
  Utensils,
  Waypoints,
  Waves,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import type {
  AiCategory,
  AreaGeometrySource,
  AreaKind,
  AiVerdict,
  ComplaintReason,
  EventPhase,
  ExternalSourceId,
  HistoryKind,
  InfoSource,
  IssueSeverity,
  IssueStage,
  Layer,
  MinStatus,
  ModerationAction,
  ModerationTrigger,
  NotificationKind,
  OutageResource,
  PathMode,
  PlaceStatus,
  RouteDifficulty,
  RouteKind,
  RouteStatus,
  RouteVisibility,
  StopKind,
  UserLevel,
  UserRole,
  VoteKind,
} from '../api/types';
import type { Tone } from './tones';

interface Meta {
  label: string;
  tone: Tone;
  icon: LucideIcon;
}

interface DescribedMeta extends Meta {
  /** One-line explanation shown in tooltips and hints. */
  description: string;
}

// ── Layers ──────────────────────────────────────────────────────────────────────────────

export const LAYERS: readonly Layer[] = ['infrastructure', 'event', 'tourism', 'issue'];

interface LayerMeta extends DescribedMeta {
  /** Short label for compact toggles. */
  short: string;
  /** Singular noun for a publication of this layer («место», «событие»…). */
  noun: string;
  /** Hex colour for map objects drawn outside CSS (markers, circles, lines). */
  color: string;
  /** Call to action in the create wizard. */
  createTitle: string;
  examples: string;
}

export const LAYER_META: Record<Layer, LayerMeta> = {
  infrastructure: {
    label: 'Инфраструктура',
    short: 'Полезное',
    noun: 'место',
    tone: 'infrastructure',
    icon: MapPin,
    color: '#0EA5A4',
    description: 'Туалеты, вода, первая помощь, доступная среда, спортплощадки',
    createTitle: 'Полезное место',
    examples: 'Туалет, питьевая вода, пандус, аптечка, спортплощадка, Wi-Fi',
  },
  event: {
    label: 'События',
    short: 'События',
    noun: 'событие',
    tone: 'event',
    icon: CalendarDays,
    color: '#7C5CFC',
    description: 'Городские события и небольшие встречи жителей',
    createTitle: 'Событие или встреча',
    examples: 'Концерт, лекция, субботник, игра в баскетбол, прогулка',
  },
  tourism: {
    label: 'Интересные места',
    short: 'Интересное',
    noun: 'место',
    tone: 'tourism',
    icon: Compass,
    color: '#F97316',
    description: 'Места, которые знают местные: виды, еда, история, природа',
    createTitle: 'Интересное место',
    examples: 'Видовая точка, необычный двор, кафе «для своих», тропа',
  },
  issue: {
    label: 'Проблемы',
    short: 'Проблемы',
    noun: 'сообщение',
    tone: 'issue',
    icon: TriangleAlert,
    color: '#E5484D',
    description: 'Городские проблемы и отключения коммунальных услуг',
    createTitle: 'Проблема в городе',
    examples: 'Яма на дороге, отключение воды, сломанный фонарь, опасное место',
  },
};

// ── Publication status & trust ──────────────────────────────────────────────────────────

export const STATUS_META: Record<PlaceStatus, DescribedMeta> = {
  pending: {
    label: 'На проверке',
    tone: 'neutral',
    icon: Clock,
    description: 'Ждёт проверки модератором и пока видна только автору',
  },
  unverified: {
    label: 'Не подтверждено',
    tone: 'neutral',
    icon: CircleDashed,
    description: 'Добавлено недавно, независимых подтверждений ещё нет',
  },
  preliminary: {
    label: 'Есть подтверждения',
    tone: 'infrastructure',
    icon: CircleCheck,
    description: 'Первые жители подтвердили, что информация верна',
  },
  verified: {
    label: 'Проверено жителями',
    tone: 'success',
    icon: BadgeCheck,
    description: 'Несколько независимых жителей подтвердили информацию',
  },
  needs_review: {
    label: 'Требует уточнения',
    tone: 'warning',
    icon: CircleAlert,
    description: 'Жители сообщают противоречивые сведения — проверьте на месте',
  },
  hidden: {
    label: 'Скрыто',
    tone: 'danger',
    icon: EyeOff,
    description: 'Убрано с карты из-за серьёзных сомнений в достоверности',
  },
  archived: {
    label: 'В архиве',
    tone: 'neutral',
    icon: Archive,
    description: 'Больше не актуально, сохранено для истории',
  },
};

export const MIN_STATUS_OPTIONS: readonly { value: MinStatus; label: string; hint: string }[] = [
  { value: 'any', label: 'Всё', hint: 'Показываем всё, включая новые метки без подтверждений' },
  {
    value: 'preliminary',
    label: 'С подтверждениями',
    hint: 'Только метки, которые подтвердил хотя бы один житель',
  },
  {
    value: 'verified',
    label: 'Только проверенные',
    hint: 'Только метки, подтверждённые несколькими независимыми жителями',
  },
];

export const INFO_SOURCE_META: Record<InfoSource, DescribedMeta> = {
  user: {
    label: 'Сообщение жителей',
    tone: 'neutral',
    icon: Users,
    description: 'Сообщение жителей, не подтверждено официально',
  },
  official: {
    label: 'Официальная информация',
    tone: 'official',
    icon: ShieldCheck,
    description: 'Данные подтверждены ответственной организацией',
  },
};

// ── Verification votes ──────────────────────────────────────────────────────────────────

export const VOTE_KINDS: readonly VoteKind[] = ['present', 'absent', 'unclear'];

interface VoteMeta extends Meta {
  /** Past-tense phrase for «Вы отметили: …». */
  done: string;
}

export const VOTE_META: Record<VoteKind, VoteMeta> = {
  present: { label: 'Присутствует', tone: 'success', icon: CircleCheck, done: 'место на месте' },
  absent: { label: 'Отсутствует', tone: 'danger', icon: CircleX, done: 'места здесь нет' },
  unclear: {
    label: 'Требует уточнения',
    tone: 'warning',
    icon: CircleHelp,
    done: 'информация требует уточнения',
  },
};

/** Issues reuse the same votes with their own wording (SPEC §3.3). */
export const ISSUE_VOTE_META: Record<VoteKind, VoteMeta> = {
  present: { label: 'Проблема есть', tone: 'danger', icon: CircleAlert, done: 'проблема есть' },
  absent: { label: 'Устранено', tone: 'success', icon: CircleCheck, done: 'проблема устранена' },
  unclear: {
    label: 'Ситуация изменилась',
    tone: 'warning',
    icon: CircleHelp,
    done: 'ситуация изменилась',
  },
};

export function voteMeta(layer: Layer): Record<VoteKind, VoteMeta> {
  return layer === 'issue' ? ISSUE_VOTE_META : VOTE_META;
}

// ── Users ───────────────────────────────────────────────────────────────────────────────

export const LEVELS: readonly UserLevel[] = ['newcomer', 'resident', 'trusted', 'expert'];

interface LevelMeta extends DescribedMeta {
  /** Reputation needed to reach the level. */
  from: number;
}

export const LEVEL_META: Record<UserLevel, LevelMeta> = {
  newcomer: {
    label: 'Новичок',
    tone: 'neutral',
    icon: Sprout,
    from: 0,
    description: 'Публикации проходят проверку модератором, до 3 мест в день',
  },
  resident: {
    label: 'Житель',
    tone: 'infrastructure',
    icon: MapPinned,
    from: 10,
    description: 'Публикует сразу, до 10 мест в день',
  },
  trusted: {
    label: 'Знаток',
    tone: 'event',
    icon: Award,
    from: 50,
    description: 'Мнение при проверке мест учитывается сильнее, до 30 мест в день',
  },
  expert: {
    label: 'Эксперт',
    tone: 'beam',
    icon: Sparkles,
    from: 150,
    description: 'Публикации сразу получают предварительное подтверждение',
  },
};

export const ROLE_LABELS: Record<UserRole, string> = {
  user: 'Участник',
  moderator: 'Модератор',
  admin: 'Администратор',
};

// ── Events ──────────────────────────────────────────────────────────────────────────────

export const PHASE_META: Record<EventPhase, Meta> = {
  open: { label: 'Запись открыта', tone: 'success', icon: UserPlus },
  closed: { label: 'Запись закрыта', tone: 'neutral', icon: Lock },
  soon: { label: 'Скоро начало', tone: 'warning', icon: Hourglass },
  ongoing: { label: 'Идёт сейчас', tone: 'event', icon: Radio },
  finished: { label: 'Завершено', tone: 'neutral', icon: CalendarClock },
  cancelled: { label: 'Отменено', tone: 'danger', icon: CalendarX },
};

// ── Issues ──────────────────────────────────────────────────────────────────────────────

export const ISSUE_STAGES: readonly IssueStage[] = [
  'detected',
  'confirmed',
  'forwarded',
  'in_progress',
  'resolved',
];

export const ISSUE_STAGE_META: Record<IssueStage, DescribedMeta> = {
  detected: {
    label: 'Обнаружена',
    tone: 'issue',
    icon: Flag,
    description: 'Житель сообщил о проблеме',
  },
  confirmed: {
    label: 'Подтверждена',
    tone: 'warning',
    icon: Users,
    description: 'Другие жители подтвердили, что проблема есть',
  },
  forwarded: {
    label: 'Передана',
    tone: 'official',
    icon: Send,
    description: 'Информация передана ответственной организации',
  },
  in_progress: {
    label: 'В работе',
    tone: 'official',
    icon: Hammer,
    description: 'Ответственная организация занимается проблемой',
  },
  resolved: {
    label: 'Устранена',
    tone: 'success',
    icon: CircleCheck,
    description: 'Проблема устранена',
  },
};

export const SEVERITIES: readonly IssueSeverity[] = ['low', 'medium', 'high'];

export const SEVERITY_META: Record<IssueSeverity, DescribedMeta> = {
  low: {
    label: 'Незначительная',
    tone: 'neutral',
    icon: CircleAlert,
    description: 'Доставляет неудобство, но не мешает',
  },
  medium: {
    label: 'Заметная',
    tone: 'warning',
    icon: CircleAlert,
    description: 'Мешает пользоваться местом или услугой',
  },
  high: {
    label: 'Серьёзная',
    tone: 'danger',
    icon: TriangleAlert,
    description: 'Опасно или затрагивает много людей',
  },
};

// ── Routes ──────────────────────────────────────────────────────────────────────────────

export const ROUTE_KINDS: readonly RouteKind[] = ['walk', 'bike', 'car', 'hike', 'excursion'];

export const ROUTE_KIND_META: Record<RouteKind, Meta> = {
  walk: { label: 'Пешком', tone: 'infrastructure', icon: Footprints },
  car: { label: 'На машине', tone: 'brand', icon: Car },
  bike: { label: 'На велосипеде', tone: 'success', icon: Bike },
  hike: { label: 'Поход', tone: 'tourism', icon: Mountain },
  excursion: { label: 'Экскурсия', tone: 'event', icon: Landmark },
};

export const ROUTE_STATUS_META: Record<RouteStatus, Meta> = {
  pending: { label: 'На проверке', tone: 'neutral', icon: Clock },
  published: { label: 'Опубликован', tone: 'success', icon: CircleCheck },
  needs_review: { label: 'Требует уточнения', tone: 'warning', icon: CircleAlert },
  hidden: { label: 'Скрыт', tone: 'danger', icon: EyeOff },
};

export const ROUTE_VISIBILITY_META: Record<RouteVisibility, DescribedMeta> = {
  private: {
    label: 'Только для меня',
    tone: 'neutral',
    icon: Lock,
    description: 'Личный план: виден только вам и не проходит модерацию',
  },
  public: {
    label: 'Для всех',
    tone: 'success',
    icon: Users,
    description: 'Маршрут увидят все жители; публикации новичков проверяет модератор',
  },
};

export const ROUTE_DIFFICULTIES: readonly RouteDifficulty[] = ['easy', 'medium', 'hard'];

export const ROUTE_DIFFICULTY_META: Record<RouteDifficulty, DescribedMeta> = {
  easy: {
    label: 'Лёгкий',
    tone: 'success',
    icon: Signal,
    description: 'Подойдёт всем, в том числе с детьми',
  },
  medium: {
    label: 'Средний',
    tone: 'warning',
    icon: SignalMedium,
    description: 'Есть подъёмы или длинные переходы — нужна удобная обувь',
  },
  hard: {
    label: 'Сложный',
    tone: 'danger',
    icon: SignalHigh,
    description: 'Для подготовленных: крутые тропы, большой набор высоты',
  },
};

export const PATH_MODE_META: Record<PathMode, DescribedMeta> = {
  roads: {
    label: 'По дорогам и тропам',
    tone: 'brand',
    icon: Route,
    description: 'Линию строим по улицам, дорожкам и тропам из OpenStreetMap',
  },
  direct: {
    label: 'По прямой',
    tone: 'tourism',
    icon: Spline,
    description: 'Прямые отрезки между точками — для троп, которых нет на карте',
  },
};

/** Stop kinds a user can choose; `via` is an invisible shaping point of the track. */
export const STOP_KINDS: readonly StopKind[] = [
  'poi',
  'viewpoint',
  'landmark',
  'water',
  'food',
  'rest',
  'camp',
  'transport',
  'danger',
  'via',
];

export const STOP_KIND_META: Record<StopKind, DescribedMeta> = {
  poi: {
    label: 'Точка интереса',
    tone: 'brand',
    icon: MapPin,
    description: 'Что посмотреть по пути',
  },
  viewpoint: {
    label: 'Видовая точка',
    tone: 'tourism',
    icon: Binoculars,
    description: 'Место с красивым видом',
  },
  landmark: {
    label: 'Ориентир',
    tone: 'neutral',
    icon: Signpost,
    description: 'Приметное место, развилка, поворот',
  },
  water: {
    label: 'Вода',
    tone: 'official',
    icon: Droplets,
    description: 'Родник, колонка, магазин с водой',
  },
  food: {
    label: 'Еда',
    tone: 'tourism',
    icon: Utensils,
    description: 'Кафе, магазин, место для перекуса',
  },
  rest: {
    label: 'Привал',
    tone: 'success',
    icon: Armchair,
    description: 'Скамейки, беседка, место для отдыха',
  },
  camp: {
    label: 'Стоянка',
    tone: 'success',
    icon: Tent,
    description: 'Место для палатки или ночёвки',
  },
  transport: {
    label: 'Транспорт',
    tone: 'event',
    icon: Bus,
    description: 'Остановка, парковка, станция',
  },
  danger: {
    label: 'Осторожно',
    tone: 'danger',
    icon: TriangleAlert,
    description: 'Опасный участок: обрыв, брод, трасса',
  },
  via: {
    label: 'Промежуточная точка',
    tone: 'neutral',
    icon: Waypoints,
    description: 'Невидимая точка, уточняющая линию маршрута',
  },
};

// ── External sources ────────────────────────────────────────────────────────────────────

/** Imported content: distinct from user content (neutral) and official info (blue). */
export const EXTERNAL_SOURCE_META: Record<ExternalSourceId, DescribedMeta & { linkLabel: string }> =
  {
    vl_ru: {
      label: 'Афиша VL.ru',
      tone: 'neutral',
      icon: Newspaper,
      description: 'Событие импортировано из афиши VL.ru — детали и билеты на сайте источника',
      linkLabel: 'Подробности и билеты на VL.ru',
    },
    vl_ru_off: {
      label: 'Отключения VL.ru',
      tone: 'neutral',
      icon: Newspaper,
      description:
        'Отключение импортировано с VL.ru: адреса собраны по данным служб и жалобам жителей',
      linkLabel: 'Отключение на VL.ru',
    },
    osm: {
      label: 'OpenStreetMap',
      tone: 'infrastructure',
      icon: Globe,
      description: 'Объект взят из OpenStreetMap — открытой карты, которую ведут волонтёры',
      linkLabel: 'Объект в OpenStreetMap',
    },
    wikivoyage: {
      label: 'Викигид',
      tone: 'tourism',
      icon: BookOpen,
      description: 'Место из путеводителя Викигид — его описали путешественники, а не жители',
      linkLabel: 'Статья в Викигиде',
    },
  };

// ── Utility outages ─────────────────────────────────────────────────────────────────────

export const OUTAGE_RESOURCES: readonly OutageResource[] = [
  'cold_water',
  'hot_water',
  'heat',
  'electricity',
];

interface OutageResourceMeta extends Meta {
  /** «Нет холодной воды» — for titles and summaries. */
  missing: string;
  /** Hex colour for house dots on the map. */
  color: string;
}

export const OUTAGE_RESOURCE_META: Record<OutageResource, OutageResourceMeta> = {
  cold_water: {
    label: 'Холодная вода',
    missing: 'Нет холодной воды',
    tone: 'official',
    icon: Droplet,
    color: '#2563EB',
  },
  hot_water: {
    label: 'Горячая вода',
    missing: 'Нет горячей воды',
    tone: 'issue',
    icon: Droplets,
    color: '#E5484D',
  },
  heat: {
    label: 'Отопление',
    missing: 'Нет отопления',
    tone: 'tourism',
    icon: Flame,
    color: '#F97316',
  },
  electricity: {
    label: 'Электричество',
    missing: 'Нет электричества',
    tone: 'event',
    icon: Zap,
    color: '#7C5CFC',
  },
};

// ── Areas (locations, SPEC §17) ─────────────────────────────────────────────────────────

export const AREA_KINDS: readonly AreaKind[] = [
  'park',
  'embankment',
  'square',
  'beach',
  'island',
  'viewpoint',
  'campus',
  'quarter',
  'complex',
  'other',
];

export const AREA_KIND_META: Record<AreaKind, Meta> = {
  park: { label: 'Парк', tone: 'success', icon: Trees },
  embankment: { label: 'Набережная', tone: 'official', icon: Waves },
  square: { label: 'Площадь', tone: 'brand', icon: LandPlot },
  beach: { label: 'Пляж', tone: 'beam', icon: TreePalm },
  island: { label: 'Остров', tone: 'infrastructure', icon: Sailboat },
  viewpoint: { label: 'Видовая', tone: 'tourism', icon: Binoculars },
  campus: { label: 'Кампус', tone: 'event', icon: GraduationCap },
  quarter: { label: 'Квартал', tone: 'neutral', icon: Building2 },
  complex: { label: 'Комплекс', tone: 'brand', icon: Landmark },
  other: { label: 'Другое', tone: 'neutral', icon: MapPinned },
};

export type InterestTier = 0 | 1 | 2 | 3;

export interface InterestMeta {
  tier: InterestTier;
  /** «Очень интересно» — shown next to the plain count of places. */
  label: string;
  tone: Tone;
  /** Hex colour for map objects (area pill, territory polygon). */
  color: string;
}

const INTEREST_TIERS: readonly (Omit<InterestMeta, 'tier'> & { below: number })[] = [
  { below: 25, label: 'Пока мало отмечено', tone: 'neutral', color: '#8A99AB' },
  { below: 50, label: 'Есть что посмотреть', tone: 'brand', color: '#2F5D8A' },
  { below: 75, label: 'Интересное место', tone: 'tourism', color: '#F97316' },
  { below: Infinity, label: 'Очень интересно', tone: 'beam', color: '#E8A317' },
];

/** Interest 0..100 → tier label, tone and map colour (thresholds 25 / 50 / 75, SPEC §17). */
export function interestLabel(interest: number): InterestMeta {
  const index = INTEREST_TIERS.findIndex((tier) => interest < tier.below);
  const { below: _below, ...meta } = INTEREST_TIERS[index] ?? INTEREST_TIERS[0]!;
  return { tier: index as InterestTier, ...meta };
}

export const AREA_GEOMETRY_SOURCE_META: Record<AreaGeometrySource, { label: string }> = {
  '2gis': { label: '2ГИС' },
  osm: { label: 'OpenStreetMap' },
};

// ── Complaints & moderation ─────────────────────────────────────────────────────────────

/** Reasons applicable to places; `impassable` is offered for routes only. */
export const PLACE_COMPLAINT_REASONS: readonly ComplaintReason[] = [
  'inaccurate',
  'outdated',
  'duplicate',
  'spam',
  'offensive',
  'fraud',
  'rules',
];

export const ROUTE_COMPLAINT_REASONS: readonly ComplaintReason[] = [
  'impassable',
  ...PLACE_COMPLAINT_REASONS,
];

export const COMPLAINT_REASON_META: Record<ComplaintReason, DescribedMeta> = {
  inaccurate: {
    label: 'Неточная информация',
    tone: 'warning',
    icon: FileWarning,
    description: 'Описание, адрес или точка на карте не соответствуют действительности',
  },
  duplicate: {
    label: 'Дубликат',
    tone: 'neutral',
    icon: Copy,
    description: 'Такая публикация уже есть на карте',
  },
  outdated: {
    label: 'Устарело',
    tone: 'neutral',
    icon: History,
    description: 'Этого больше нет или информация потеряла актуальность',
  },
  spam: {
    label: 'Спам или реклама',
    tone: 'danger',
    icon: Ban,
    description: 'Навязчивая реклама, бессмысленный текст',
  },
  offensive: {
    label: 'Оскорбительное содержание',
    tone: 'danger',
    icon: ShieldAlert,
    description: 'Оскорбления, мат, неприемлемые изображения',
  },
  rules: {
    label: 'Нарушение правил',
    tone: 'warning',
    icon: Scale,
    description: 'Публикация нарушает правила сервиса',
  },
  fraud: {
    label: 'Мошенничество',
    tone: 'danger',
    icon: TriangleAlert,
    description: 'Обман, сбор денег, фишинговые ссылки',
  },
  impassable: {
    label: 'Маршрут непроходим',
    tone: 'warning',
    icon: Footprints,
    description: 'По маршруту нельзя пройти или проехать',
  },
};

export const MODERATION_TRIGGER_META: Record<ModerationTrigger, Meta> = {
  premoderation: { label: 'Премодерация новичка', tone: 'neutral', icon: Sprout },
  complaints: { label: 'Жалобы', tone: 'danger', icon: Flag },
  absent_votes: { label: 'Голоса «отсутствует»', tone: 'warning', icon: CircleX },
  auto_text: { label: 'Автопроверка текста', tone: 'event', icon: FileWarning },
  auto_image: { label: 'Автопроверка фото', tone: 'event', icon: ImageOff },
  auto_ai: { label: 'Проверка ИИ', tone: 'event', icon: Bot },
  appeal: { label: 'Апелляция', tone: 'official', icon: Scale },
  clarification: { label: 'Уточнение от жителя', tone: 'warning', icon: MessageCircleQuestion },
};

/** Verdict of the advisory LLM pre-screening. */
export const AI_VERDICT_META: Record<AiVerdict, Meta> = {
  ok: { label: 'Нарушений не найдено', tone: 'success', icon: CircleCheck },
  suspicious: { label: 'Подозрительно', tone: 'warning', icon: CircleAlert },
  violation: { label: 'Нарушение', tone: 'danger', icon: ShieldAlert },
};

export const AI_CATEGORY_LABELS: Record<AiCategory, string> = {
  spam: 'Спам',
  ads: 'Реклама',
  offensive: 'Оскорбления',
  personal_data: 'Персональные данные',
  fraud: 'Мошенничество',
  off_topic: 'Не по теме',
  nonsense: 'Бессмыслица',
  dangerous: 'Опасный контент',
  inappropriate_image: 'Неподходящее изображение',
  nudity: 'Нагота',
  sexual: 'Сексуальное',
  violence: 'Насилие',
  shocking: 'Шокирующее',
  obscene: 'Непристойное',
  advertising: 'Реклама',
  not_a_place: 'Не про место',
};

interface ModerationActionMeta extends DescribedMeta {
  /** Past-tense label for the log («Одобрено»). */
  done: string;
}

export const MODERATION_ACTION_META: Record<ModerationAction, ModerationActionMeta> = {
  approve: {
    label: 'Одобрить',
    done: 'Одобрено',
    tone: 'success',
    icon: CircleCheck,
    description: 'Публикация остаётся на карте, жалобы отклоняются',
  },
  reject: {
    label: 'Отклонить',
    done: 'Отклонено',
    tone: 'danger',
    icon: CircleX,
    description: 'Публикация уходит в архив, автор теряет репутацию',
  },
  request_changes: {
    label: 'Запросить правки',
    done: 'Запрошены правки',
    tone: 'warning',
    icon: Pencil,
    description: 'Автор получит уведомление с причиной и сможет исправить',
  },
  hide: {
    label: 'Скрыть',
    done: 'Скрыто',
    tone: 'danger',
    icon: EyeOff,
    description: 'Публикация скрывается с карты, жалобы признаются обоснованными',
  },
  restore: {
    label: 'Восстановить',
    done: 'Восстановлено',
    tone: 'official',
    icon: RotateCcw,
    description: 'Публикация возвращается на карту',
  },
  release: {
    label: 'Выпустить',
    done: 'Выпущено',
    tone: 'success',
    icon: Eye,
    description: 'Проверка ошиблась: все увидят, автор получит уведомление, что опубликовано',
  },
  remove: {
    label: 'Убрать',
    done: 'Убрано',
    tone: 'danger',
    icon: Trash2,
    description: 'Никто не увидит; автор получит уведомление с причиной',
  },
};

// ── Notifications & history ─────────────────────────────────────────────────────────────

export const NOTIFICATION_KIND_META: Record<NotificationKind, Meta> = {
  event_joined: { label: 'Новый участник', tone: 'event', icon: UserPlus },
  event_changed: { label: 'Событие изменилось', tone: 'event', icon: CalendarClock },
  event_cancelled: { label: 'Событие отменено', tone: 'danger', icon: CalendarX },
  comment: { label: 'Комментарий', tone: 'brand', icon: MessageCircle },
  respect: { label: 'Респект', tone: 'tourism', icon: Heart },
  moderation: { label: 'Модерация', tone: 'official', icon: Gavel },
  place_verified: { label: 'Место проверено', tone: 'success', icon: BadgeCheck },
  level_up: { label: 'Новый уровень', tone: 'beam', icon: TrendingUp },
  issue_update: { label: 'Проблема: обновление', tone: 'issue', icon: TriangleAlert },
  territory: { label: 'Рядом с вами', tone: 'infrastructure', icon: MapPinned },
  lost_found: { label: 'Потеряшки', tone: 'beam', icon: PackageSearch },
};

export const NOTIFICATION_FALLBACK_META: Meta = {
  label: 'Уведомление',
  tone: 'neutral',
  icon: Bell,
};

export const HISTORY_KIND_META: Record<HistoryKind, Meta> = {
  created: { label: 'Создано', tone: 'brand', icon: MapPin },
  edited: { label: 'Изменено', tone: 'neutral', icon: Pencil },
  status_changed: { label: 'Статус изменён', tone: 'success', icon: ThumbsUp },
  moderation: { label: 'Решение модератора', tone: 'official', icon: Gavel },
  issue_stage: { label: 'Этап проблемы', tone: 'issue', icon: TriangleAlert },
  official_info: { label: 'Официальная информация', tone: 'official', icon: ShieldCheck },
  photos_added: { label: 'Добавлены фото', tone: 'neutral', icon: Camera },
};
