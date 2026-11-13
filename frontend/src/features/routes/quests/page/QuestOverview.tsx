import {
  Clock,
  EyeOff,
  Flag,
  Lightbulb,
  Lock,
  MapPinned,
  Puzzle,
  Trophy,
  Users,
  type LucideIcon,
} from 'lucide-react';

import { useMapActions } from '@/features/map';
import { ScreeningHoldBanner } from '@/features/places';
import type { QuestDetail } from '@/shared/api';
import { formatDuration, formatNumber } from '@/shared/lib/format';
import { Banner, Button, usePanelStore } from '@/shared/ui';

import { formatResult, HINT_PENALTY_MIN } from '../lib/meta';
import { QuestResults } from './QuestResults';
import { QuestReviews } from './QuestReviews';

function StateBanner({ quest }: { quest: QuestDetail }) {
  if (quest.visibility === 'private') {
    return (
      <Banner tone="neutral" icon={Lock} title="Черновик — видите только вы">
        Пройдите квест как игрок, проверьте загадки и опубликуйте его в редакторе. Черновик не
        проходит модерацию.
      </Banner>
    );
  }
  if (quest.status === 'pending') {
    if (quest.screening_hold)
      return <ScreeningHoldBanner hold={quest.screening_hold} what="route" />;
    return (
      <Banner tone="infrastructure" icon={Clock} title="На проверке у модератора">
        Квест появится в каталоге после проверки.
      </Banner>
    );
  }
  if (quest.status === 'hidden') {
    return (
      <Banner tone="danger" icon={EyeOff} title="Скрыт модератором">
        Квест не виден другим жителям.
      </Banner>
    );
  }
  return null;
}

function Fact({ icon: Icon, value, label }: { icon: LucideIcon; value: string; label: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-control bg-canvas px-3 py-2">
      <span className="flex items-center gap-1 text-xs text-ink-soft">
        <Icon size={13} aria-hidden className="shrink-0 text-event" />
        {label}
      </span>
      <span className="font-display text-base font-semibold whitespace-nowrap text-ink tabular-nums">
        {value}
      </span>
    </div>
  );
}

const RULES: { icon: LucideIcon; text: string }[] = [
  {
    icon: Puzzle,
    text: 'Каждый этап — загадка о месте. Следующая откроется, когда найдёте это место.',
  },
  {
    icon: MapPinned,
    text: 'На месте подтвердите, что нашли: геолокацией, кодом или ответом на вопрос.',
  },
  {
    icon: Lightbulb,
    text: `Застряли — возьмите подсказку: она добавит ${HINT_PENALTY_MIN} минут к времени.`,
  },
  { icon: Users, text: 'В команде загадку каждого этапа видит только один игрок — по очереди.' },
];

/** Everything public about a quest: its story, start, rules, results and reviews. */
export function QuestOverview({ quest }: { quest: QuestDetail }) {
  const { flyTo } = useMapActions();
  const showMap = usePanelStore((state) => state.showMap);

  return (
    <div className="flex flex-col gap-5">
      {quest.cover_url && (
        <img
          src={quest.cover_url}
          alt=""
          className="aspect-[16/9] w-full rounded-card object-cover"
        />
      )}
      <StateBanner quest={quest} />
      <div className="grid grid-cols-3 gap-2">
        <Fact icon={Puzzle} value={String(quest.stages_count)} label="Этапов" />
        <Fact icon={Clock} value={formatDuration(quest.duration_min)} label="Примерно" />
        <Fact icon={Trophy} value={formatNumber(quest.finished_count)} label="Прошли" />
      </div>
      {quest.my_result && (
        <Banner
          tone="beam"
          icon={Trophy}
          title={`Ваш лучший результат — ${formatResult(quest.my_result.result_s)}`}
        >
          {quest.my_result.rank > 0
            ? `${quest.my_result.rank}-е место в таблице.`
            : 'Спасибо за игру!'}
        </Banner>
      )}
      {quest.description && (
        <p className="text-base [overflow-wrap:anywhere] whitespace-pre-line text-ink">
          {quest.description}
        </p>
      )}
      <div className="flex items-center gap-3 rounded-card border border-line p-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-event text-white">
          <Flag size={18} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-ink-soft">Где начинается</span>
          <span className="block text-sm font-semibold text-ink">{quest.start.title}</span>
        </span>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            flyTo(quest.start, { minZoom: 16 });
            showMap();
          }}
        >
          На карте
        </Button>
      </div>
      <section aria-labelledby="quest-rules" className="flex flex-col gap-2.5">
        <h2 id="quest-rules" className="font-display text-base font-semibold text-ink">
          Как играть
        </h2>
        <ul className="flex flex-col gap-2">
          {RULES.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3 text-sm text-ink">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-event-soft text-event">
                <Icon size={15} aria-hidden />
              </span>
              <span className="pt-1">{text}</span>
            </li>
          ))}
        </ul>
      </section>
      <QuestResults questId={quest.id} />
      <QuestReviews quest={quest} />
    </div>
  );
}
