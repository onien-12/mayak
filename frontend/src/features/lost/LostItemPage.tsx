import {
  CalendarDays,
  CheckCheck,
  EyeOff,
  Flag,
  HelpCircle,
  MapPin,
  MapPinOff,
  MessageSquareReply,
  Trash2,
  Undo2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { requireAuth } from '@/features/auth';
import { useMapActions } from '@/features/map';
import { lostApi, type LostItem } from '@/shared/api';
import { formatDate, formatRelative } from '@/shared/lib/format';
import {
  Banner,
  Button,
  buttonClasses,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  IconButton,
  ListSkeleton,
  OnReviewMark,
  PanelLayout,
  PhotoGrid,
  Skeleton,
  UserChip,
  usePanelStore,
} from '@/shared/ui';

import { KindBadge, LostCard } from './LostCard';
import { LostMapLayer } from './LostMapLayer';
import {
  happenedLabel,
  LOST_CATEGORY_META,
  LOST_KIND_META,
  LOST_STATE_LABELS,
  radiusLabel,
} from './lostMeta';
import { MyResponse, RespondDialog, ResponsesBlock } from './LostResponses';
import { isNotFound, useLostItem, useLostItemAction, useLostList, useLostMatches } from './useLost';

/** Zoom that shows a 1 km circle whole on a phone. */
const FOCUS_ZOOM = 14;

function Matches({ item }: { item: LostItem }) {
  const matches = useLostMatches(item);
  const allowed = item.kind === 'lost' || item.is_mine || item.can_moderate;
  if (!allowed || item.state !== 'active') return null;
  const title = item.kind === 'lost' ? 'Похожие находки' : 'Возможно, это ищут';
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      {matches.isPending ? (
        <ListSkeleton rows={1} />
      ) : matches.data && matches.data.length > 0 ? (
        matches.data.map((match) => (
          <LostCard key={match.item.id} item={match.item} reason={match.reason} />
        ))
      ) : (
        <p className="text-sm text-ink-soft">
          {item.kind === 'lost'
            ? 'Похожих находок пока нет. Как только появится похожая, придёт уведомление.'
            : 'Похожих пропаж пока нет. Если кто-то напишет, что ищет такую вещь, придёт уведомление.'}
        </p>
      )}
    </section>
  );
}

function Facts({ item }: { item: LostItem }) {
  const Category = LOST_CATEGORY_META[item.category].icon;
  return (
    <ul className="flex flex-col gap-1.5 text-sm text-ink">
      <li className="flex items-center gap-2">
        <Category size={16} aria-hidden className="shrink-0 text-ink-soft" />
        {LOST_CATEGORY_META[item.category].label}
      </li>
      <li className="flex items-center gap-2">
        <CalendarDays size={16} aria-hidden className="shrink-0 text-ink-soft" />
        {happenedLabel(item.kind, item.happened_on)}
      </li>
      {item.kind === 'lost' && (
        <li className="flex items-center gap-2">
          <MapPin size={16} aria-hidden className="shrink-0 text-ink-soft" />
          Потеряли {radiusLabel(item.radius_m)}
        </li>
      )}
    </ul>
  );
}

function OwnerActions({ item }: { item: LostItem }) {
  const navigate = useNavigate();
  const close = useLostItemAction(lostApi.close, 'Отмечено: вернули хозяину. Спасибо!');
  const remove = useLostItemAction(lostApi.remove, 'Объявление удалено');
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      {item.is_mine && item.state === 'active' && (
        <Button
          variant="secondary"
          icon={CheckCheck}
          loading={close.isPending}
          onClick={() => close.mutate(item.id)}
        >
          Вернули хозяину
        </Button>
      )}
      {item.can_delete && (
        <Button variant="ghost" icon={Trash2} onClick={() => setConfirmDelete(true)}>
          Удалить объявление
        </Button>
      )}
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() =>
          remove.mutate(item.id, {
            onSuccess: () => {
              setConfirmDelete(false);
              navigate('/lost');
            },
          })
        }
        title="Удалить объявление?"
        description="Отклики на него тоже пропадут."
        confirmLabel="Удалить"
        danger
        loading={remove.isPending}
      />
    </div>
  );
}

function ModeratorActions({ item }: { item: LostItem }) {
  const hide = useLostItemAction(lostApi.hide, 'Объявление скрыто');
  const unhide = useLostItemAction(lostApi.unhide, 'Объявление снова видно всем');
  if (!item.can_moderate || item.is_mine) return null;
  return item.is_hidden ? (
    <Button
      variant="secondary"
      icon={Undo2}
      loading={unhide.isPending}
      onClick={() => unhide.mutate(item.id)}
    >
      Вернуть объявление
    </Button>
  ) : (
    <Button
      variant="ghost"
      icon={EyeOff}
      loading={hide.isPending}
      onClick={() => hide.mutate(item.id)}
    >
      Скрыть (модератор)
    </Button>
  );
}

function ItemView({ item }: { item: LostItem }) {
  const navigate = useNavigate();
  const list = useLostList();
  const { flyTo } = useMapActions();
  const [responding, setResponding] = useState(false);
  const report = useLostItemAction(lostApi.report, 'Жалоба отправлена — спасибо');
  const isFound = item.kind === 'found';

  const reveal = usePanelStore((state) => state.reveal);
  const { lat, lng } = item;
  useEffect(() => {
    reveal();
    flyTo({ lat, lng }, { minZoom: FOCUS_ZOOM });
  }, [flyTo, reveal, lat, lng]);

  const respond = () => requireAuth(() => setResponding(true), 'чтобы написать автору');

  const footer =
    item.state === 'active' && !item.is_mine && !item.my_response ? (
      <Button block size="lg" icon={MessageSquareReply} onClick={respond}>
        {isFound ? 'Это моё' : 'Я нашёл это'}
      </Button>
    ) : undefined;

  return (
    <>
      <LostMapLayer
        items={list.data ?? []}
        selected={item}
        onOpen={(id) => navigate(`/lost/${id}`)}
      />
      <PanelLayout
        title={item.title}
        subtitle={`Потеряшки · ${LOST_KIND_META[item.kind].label.toLowerCase()} ${formatRelative(item.created_at)}`}
        onBack={() => navigate('/lost')}
        backLabel="К потеряшкам"
        actions={
          !item.is_mine && (
            <IconButton
              icon={Flag}
              label={item.reported_by_me ? 'Жалоба отправлена' : 'Пожаловаться'}
              disabled={item.reported_by_me}
              onClick={() => requireAuth(() => report.mutate(item.id), 'чтобы пожаловаться')}
            />
          )
        }
        footer={footer}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <KindBadge kind={item.kind} />
            {item.state !== 'active' && (
              <span className="rounded-full bg-canvas px-2 py-0.5 text-xs font-medium text-ink-soft">
                {LOST_STATE_LABELS[item.state]}
              </span>
            )}
            {item.on_review && <OnReviewMark />}
          </div>
          {item.is_hidden && (
            <Banner tone="warning" icon={EyeOff} title="Скрыто">
              Объявление не видно жителям: на него пожаловались или его скрыл модератор.
            </Banner>
          )}
          <PhotoGrid photos={item.photos} alt={item.title} />
          {item.description && (
            <p className="text-base whitespace-pre-line text-ink">{item.description}</p>
          )}
          <Facts item={item} />
          {isFound && item.control_question && (
            <p className="flex gap-2 rounded-control bg-beam-soft px-3 py-2 text-sm text-ink">
              <HelpCircle size={16} aria-hidden className="mt-0.5 shrink-0" />
              <span>
                Чтобы забрать, ответьте автору на вопрос:{' '}
                <span className="font-semibold">«{item.control_question}»</span>
              </span>
            </p>
          )}
          <UserChip user={item.author} size="sm" caption="автор объявления" />
          {item.state === 'active' && (
            <p className="text-xs text-ink-faint">
              Объявление уберётся с карты {formatDate(item.expires_at)}.
            </p>
          )}
          {item.my_response && <MyResponse response={item.my_response} />}
          {item.is_mine && <ResponsesBlock item={item} />}
          <Matches item={item} />
          <OwnerActions item={item} />
          <ModeratorActions item={item} />
        </div>
      </PanelLayout>
      <RespondDialog item={item} open={responding} onClose={() => setResponding(false)} />
    </>
  );
}

/** `/lost/:id` — one post: what, where (pin and circle on the map), matches and responses. */
export default function LostItemPage() {
  const navigate = useNavigate();
  const id = Number(useParams().id);
  const item = useLostItem(id);

  if (item.data) return <ItemView key={item.data.id} item={item.data} />;

  const missing = Number.isNaN(id) || isNotFound(item.error);
  return (
    <PanelLayout title="Потеряшки" onBack={() => navigate('/lost')} backLabel="К потеряшкам">
      {missing ? (
        <EmptyState
          icon={MapPinOff}
          title="Объявление не найдено"
          description="Возможно, его удалили или оно ещё на проверке."
          action={
            <Link to="/lost" className={buttonClasses({ variant: 'secondary' })}>
              Все объявления
            </Link>
          }
        />
      ) : item.isError ? (
        <ErrorState error={item.error} onRetry={() => void item.refetch()} />
      ) : (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-6 w-2/3 rounded-full" />
          <Skeleton className="h-40 rounded-card" />
          <Skeleton className="h-16 rounded-control" />
        </div>
      )}
    </PanelLayout>
  );
}
