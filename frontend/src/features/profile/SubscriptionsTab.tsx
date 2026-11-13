import { BellPlus, BellRing, Home, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';

import type { Subscription } from '@/shared/api';
import { formatDistance } from '@/shared/lib/format';
import { LAYER_META } from '@/shared/lib/labels';
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  IconButton,
  Skeleton,
  SPRING,
  TWEEN,
} from '@/shared/ui';

import { SubscriptionCreator } from './SubscriptionCreator';
import { SUBSCRIPTIONS_MAX, useDeleteSubscription, useSubscriptions } from './useProfile';

interface RowProps {
  item: Subscription;
  automatic: boolean;
  onDelete: (item: Subscription) => void;
}

function SubscriptionRow({ item, automatic, onDelete }: RowProps) {
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, transition: TWEEN.fast }}
      transition={SPRING.sheet}
      className="flex items-start gap-3 rounded-card border border-line/70 bg-surface p-3"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
        {automatic ? <Home size={18} aria-hidden /> : <BellRing size={18} aria-hidden />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 text-base font-semibold text-ink">
          {item.title}
          {automatic && <Badge tone="beam">Автоматически</Badge>}
        </p>
        <p className="text-sm text-ink-soft">
          Радиус {formatDistance(item.radius_m)}
          {automatic && ' · настраивается в «Мой район»'}
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          {item.layers.map((layer) => (
            <Badge key={layer} tone={LAYER_META[layer].tone} icon={LAYER_META[layer].icon}>
              {LAYER_META[layer].short}
            </Badge>
          ))}
        </div>
      </div>
      {!automatic && (
        <IconButton
          icon={Trash2}
          label={`Удалить подписку «${item.title}»`}
          onClick={() => onDelete(item)}
          className="-mt-1 -mr-1"
        />
      )}
    </motion.li>
  );
}

/** «Подписки на территории»: notifications about new places inside chosen circles (max 10). */
export function SubscriptionsTab() {
  const subscriptions = useSubscriptions(true);
  const remove = useDeleteSubscription();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Subscription | null>(null);
  const count = subscriptions.data?.length ?? 0;
  const full = count >= SUBSCRIPTIONS_MAX;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-soft">
        Сообщим, когда в выбранном районе появится новое место, событие или проблема.
      </p>
      {subscriptions.isPending && <Skeleton className="h-24 rounded-card" />}
      {subscriptions.isError && (
        <ErrorState error={subscriptions.error} onRetry={() => void subscriptions.refetch()} />
      )}
      {subscriptions.data?.length === 0 && (
        <EmptyState
          icon={BellPlus}
          title="Подписок пока нет"
          description="Выберите на карте район у дома или работы — и ничего не пропустите."
        />
      )}
      {count > 0 && (
        <ul className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {subscriptions.data?.map((item) => (
              <SubscriptionRow
                key={item.id}
                item={item}
                automatic={item.is_home}
                onDelete={setDeleting}
              />
            ))}
          </AnimatePresence>
        </ul>
      )}
      <Button
        icon={BellPlus}
        variant={count > 0 ? 'secondary' : 'primary'}
        disabled={full || subscriptions.isPending}
        onClick={() => setCreating(true)}
      >
        Новая подписка
      </Button>
      {full && (
        <p className="text-center text-xs text-ink-soft">
          Можно не больше {SUBSCRIPTIONS_MAX} подписок — удалите ненужную, чтобы добавить новую
        </p>
      )}

      <SubscriptionCreator open={creating} onClose={() => setCreating(false)} />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
          setDeleting(null);
        }}
        title="Удалить подписку?"
        description={
          deleting ? `Уведомления о районе «${deleting.title}» больше не придут.` : undefined
        }
        confirmLabel="Удалить"
        danger
      />
    </div>
  );
}
