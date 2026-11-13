import { Lock, Plus, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';

import { cn } from '@/shared/lib/cn';
import { TONES } from '@/shared/lib/tones';
import { Button, ConfirmDialog, Skeleton } from '@/shared/ui';

import { ForYouMark } from './ForYou';
import { openInterestsPicker } from './localStore';
import { TopicChips } from './TopicChips';
import {
  useForgetNoticed,
  useMyInterests,
  useSaveInterests,
  useTopicCatalog,
} from './useInterests';

/**
 * «Мои интересы» in the profile settings: the chosen topics (edited in the picker), what we
 * noticed from behaviour (one tap adds it to the choice) and «Забыть замеченное». No numbers.
 * Renders nothing when the server does not support interests.
 */
export function InterestsSettings() {
  const mine = useMyInterests();
  const { topics: catalog } = useTopicCatalog();
  const save = useSaveInterests();
  const forget = useForgetNoticed();
  const [confirming, setConfirming] = useState(false);

  if (mine.isError) return null;
  const data = mine.data;
  const noticed = catalog.filter((topic) => data?.noticed.includes(topic.slug));

  return (
    <section
      aria-labelledby="my-interests"
      className="flex flex-col gap-4 rounded-card border border-line/70 p-4"
    >
      <div className="flex items-center gap-3">
        <ForYouMark size={40} />
        <div className="min-w-0">
          <h3 id="my-interests" className="text-base font-semibold text-ink">
            Мои интересы
          </h3>
          <p className="text-sm text-ink-soft">Это покажем первым на карте и в событиях</p>
        </div>
      </div>

      {!data ? (
        <Skeleton className="h-6 w-2/3" />
      ) : data.topics.length > 0 ? (
        <TopicChips
          topics={data.topics}
          variant="reason"
          max={catalog.length}
          label="Выбранные темы"
        />
      ) : (
        <p className="text-sm text-ink-soft">Пока ничего не выбрано</p>
      )}
      <Button
        variant="secondary"
        size="sm"
        icon={SlidersHorizontal}
        className="self-start"
        disabled={!data}
        onClick={() => openInterestsPicker('settings')}
      >
        {data?.topics.length ? 'Изменить' : 'Выбрать темы'}
      </Button>

      {data && noticed.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <p className="text-sm font-semibold text-ink">Мы заметили, что вам нравится</p>
          <ul aria-label="Замеченные темы" className="flex flex-wrap gap-2">
            {noticed.map((topic) => (
              <li key={topic.slug}>
                <button
                  type="button"
                  disabled={save.isPending}
                  onClick={() => save.mutate([...data.topics, topic.slug])}
                  aria-label={`Добавить «${topic.label}» в мои интересы`}
                  className={cn(
                    'tap-target relative inline-flex h-9 items-center gap-1.5 rounded-full border border-dashed px-3 text-sm font-medium transition-transform active:scale-[0.97] disabled:opacity-50',
                    TONES[topic.tone].border,
                    TONES[topic.tone].text,
                  )}
                >
                  <topic.icon size={14} aria-hidden />
                  {topic.label}
                  <Plus size={14} aria-hidden className="-mr-0.5 opacity-70" />
                </button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-ink-soft">
            По избранному, отзывам, «Я пойду» и поиску. Нажмите, чтобы добавить в свой выбор.
          </p>
          <Button
            variant="ghost"
            size="sm"
            icon={RotateCcw}
            className="self-start"
            onClick={() => setConfirming(true)}
          >
            Забыть замеченное
          </Button>
        </div>
      )}

      <p className="flex gap-2 text-xs text-ink-soft">
        <Lock size={13} aria-hidden className="mt-0.5 shrink-0" />
        Видно только вам. Мы не храним текст ваших поисков.
      </p>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => forget.mutate(undefined, { onSettled: () => setConfirming(false) })}
        loading={forget.isPending}
        title="Забыть замеченное?"
        description="Подборки «Для вас» будут строиться только по темам, которые вы выбрали сами. Ваш выбор останется."
        confirmLabel="Забыть"
      />
    </section>
  );
}
