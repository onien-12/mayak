import { FileWarning, LocateFixed, MapPinned, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { RequireAuth } from '@/features/auth';
import { MapCircle, MapTapPin, usePickPoint, useUserLocation } from '@/features/map';
import type { LostCategory, LostKind, LostRadius, Photo } from '@/shared/api';
import { useDebouncedValue, useIsDesktop } from '@/shared/hooks';
import { formatCoords, type LatLng } from '@/shared/lib/geo';
import {
  Banner,
  Button,
  Chip,
  Field,
  HonestyCheck,
  Input,
  PanelLayout,
  SegmentedControl,
  Textarea,
  useHonestyPledge,
  usePanelStore,
  useSheetPeek,
  type HonestyPledge,
} from '@/shared/ui';

import { LostCard } from './LostCard';
import {
  DOCUMENTS_HINT,
  LOST_CATEGORIES,
  LOST_CATEGORY_META,
  RADIUS_OPTIONS,
  toDayValue,
} from './lostMeta';
import { LostPhotos } from './LostPhotos';
import { lostErrorMessage, useCreateLostItem, useLostSearch } from './useLost';

/** Phone: sheet height that keeps the hint, the radius and the confirm button over the map. */
const PICK_PEEK_PX = 330;
const TITLE_MIN = 3;
const TITLE_MAX = 120;
const DESCRIPTION_MAX = 1000;
const QUESTION_MAX = 200;
const DEFAULT_RADIUS: LostRadius = 1000;

const KIND_OPTIONS: readonly { value: LostKind; label: string }[] = [
  { value: 'lost', label: 'Я потерял' },
  { value: 'found', label: 'Я нашёл' },
];

interface PointStepProps {
  kind: LostKind;
  initial: LatLng | null;
  radius: LostRadius | null;
  onRadius: (radius: LostRadius | null) => void;
  onBack: () => void;
  onConfirm: (point: LatLng) => void;
}

/** Where: the pin is fixed in the centre of the visible map, the map moves under it. */
function PointStep({ kind, initial, radius, onRadius, onBack, onConfirm }: PointStepProps) {
  const isDesktop = useIsDesktop();
  const showMap = usePanelStore((state) => state.showMap);
  const { point, moveTo } = usePickPoint(true, initial);
  const { locate, status } = useUserLocation();
  useSheetPeek(isDesktop ? null : PICK_PEEK_PX);
  useEffect(() => showMap(), [showMap]);

  const toMyLocation = async () => {
    const found = await locate({ fly: false });
    if (found) moveTo(found);
  };

  return (
    <>
      {kind === 'lost' && point && radius !== null && (
        <MapCircle center={point} radiusM={radius} color="#D6336C" />
      )}
      <PanelLayout
        title={kind === 'lost' ? 'Где потеряли?' : 'Где нашли?'}
        subtitle="Потеряшки · шаг 1 из 2"
        onBack={onBack}
        backLabel="К потеряшкам"
        footer={
          <Button
            block
            size="lg"
            icon={MapPinned}
            disabled={!point}
            onClick={() => point && onConfirm(point)}
          >
            Точка здесь
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-soft">
            Двигайте карту, чтобы булавка встала на место, или нажмите на карту.
            {point && (
              <span className="mt-0.5 block text-xs text-ink-faint tabular-nums">
                {formatCoords(point)}
              </span>
            )}
          </p>
          {kind === 'lost' && (
            <Field
              label="Насколько уверены в месте"
              hint="Чем шире круг, тем больше находок проверим."
            >
              <div className="flex flex-wrap gap-1.5">
                {RADIUS_OPTIONS.map((option) => (
                  <Chip
                    key={option.label}
                    selected={radius === option.value}
                    onClick={() => onRadius(option.value)}
                  >
                    {option.label}
                  </Chip>
                ))}
              </div>
            </Field>
          )}
          <Button
            variant="secondary"
            icon={LocateFixed}
            loading={status === 'locating'}
            onClick={() => void toMyLocation()}
          >
            Моё местоположение
          </Button>
        </div>
      </PanelLayout>
    </>
  );
}

interface Draft {
  kind: LostKind;
  category: LostCategory | '';
  title: string;
  description: string;
  happenedOn: string;
  question: string;
  photos: Photo[];
  radius: LostRadius | null;
}

/** «Может, уже нашли?» — found posts that fit what is being filed, before it is published. */
function EarlyMatches({ draft, point }: { draft: Draft; point: LatLng }) {
  const text = useDebouncedValue(`${draft.title} ${draft.description}`.trim(), 500);
  const query = {
    q: text || undefined,
    category: draft.category || undefined,
    near: draft.radius !== null ? `${point.lat.toFixed(5)},${point.lng.toFixed(5)}` : undefined,
    radius_m: draft.radius ?? undefined,
    lost_on: draft.happenedOn || undefined,
  };
  const enabled = draft.category !== '' || text.length >= 2;
  const results = useLostSearch(query, enabled);
  if (!enabled || !results.data || results.data.length === 0) return null;
  return (
    <section className="flex flex-col gap-2 rounded-card bg-success-soft/60 p-3">
      <h2 className="text-sm font-semibold text-ink">Может, уже нашли?</h2>
      {results.data.slice(0, 3).map((match) => (
        <LostCard key={match.item.id} item={match.item} reason={match.reason} />
      ))}
      <p className="text-xs text-ink-soft">
        Если это не ваше — опубликуйте объявление: сообщим, когда появится похожая находка.
      </p>
    </section>
  );
}

interface DetailsStepProps {
  draft: Draft;
  point: LatLng;
  pledge: HonestyPledge;
  onChange: (patch: Partial<Draft>) => void;
  onBack: () => void;
}

function DetailsStep({ draft, point, pledge, onChange, onBack }: DetailsStepProps) {
  const navigate = useNavigate();
  const create = useCreateLostItem();
  const setSnap = usePanelStore((state) => state.setSnap);
  const [error, setError] = useState<string | null>(null);
  // Phones: the form needs the whole sheet; the point is already chosen.
  useEffect(() => setSnap('full'), [setSnap]);
  const isLost = draft.kind === 'lost';
  const titleOk = draft.title.trim().length >= TITLE_MIN;
  const ready = draft.category !== '' && titleOk && draft.happenedOn !== '';

  const submit = () => {
    if (draft.category === '' || !pledge.confirm()) return;
    setError(null);
    create.mutate(
      {
        kind: draft.kind,
        category: draft.category,
        title: draft.title.trim(),
        description: draft.description.trim(),
        lat: point.lat,
        lng: point.lng,
        radius_m: isLost ? draft.radius : null,
        happened_on: draft.happenedOn,
        control_question: !isLost && draft.question.trim() ? draft.question.trim() : null,
        photo_ids: draft.photos.map((photo) => photo.id),
      },
      {
        onSuccess: (item) => navigate(`/lost/${item.id}`, { replace: true }),
        onError: (failure) => setError(lostErrorMessage(failure)),
      },
    );
  };

  return (
    <>
      <MapTapPin position={point} />
      {isLost && draft.radius !== null && (
        <MapCircle center={point} radiusM={draft.radius} color="#D6336C" />
      )}
      <PanelLayout
        title={isLost ? 'Что потеряли?' : 'Что нашли?'}
        subtitle="Потеряшки · шаг 2 из 2"
        onBack={onBack}
        backLabel="К выбору места"
        footer={
          <>
            <HonestyCheck pledge={pledge} className="mb-2" />
            <Button
              block
              size="lg"
              icon={Send}
              disabled={!ready}
              loading={create.isPending}
              onClick={submit}
            >
              Опубликовать
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <SegmentedControl
            label="Потерял или нашёл"
            value={draft.kind}
            onChange={(kind) => onChange({ kind })}
            options={KIND_OPTIONS}
          />
          <Field label="Что это">
            <div className="flex flex-wrap gap-1.5">
              {LOST_CATEGORIES.map((category) => (
                <Chip
                  key={category}
                  icon={LOST_CATEGORY_META[category].icon}
                  selected={draft.category === category}
                  onClick={() => onChange({ category })}
                >
                  {LOST_CATEGORY_META[category].label}
                </Chip>
              ))}
            </div>
          </Field>
          {draft.category === 'documents' && (
            <Banner tone="warning" icon={FileWarning} title="Осторожно с личными данными">
              {DOCUMENTS_HINT}
            </Banner>
          )}
          <Field
            label="Коротко"
            htmlFor="lost-title"
            hint="Например: «Чёрный кошелёк», «Ключи с брелоком»"
          >
            <Input
              id="lost-title"
              value={draft.title}
              maxLength={TITLE_MAX}
              onChange={(event) => onChange({ title: event.target.value })}
              placeholder={isLost ? 'Что потеряли' : 'Что нашли'}
            />
          </Field>
          <Field label="Подробнее" htmlFor="lost-description" optional>
            <Textarea
              id="lost-description"
              rows={3}
              maxLength={DESCRIPTION_MAX}
              value={draft.description}
              onChange={(event) => onChange({ description: event.target.value })}
              placeholder={
                isLost
                  ? 'Приметы: цвет, марка, что внутри. Где примерно шли.'
                  : 'Где лежало и где вещь сейчас. Не перечисляйте все приметы — пусть хозяин назовёт их сам.'
              }
            />
          </Field>
          <Field label={isLost ? 'Когда потеряли' : 'Когда нашли'} htmlFor="lost-day">
            <Input
              id="lost-day"
              type="date"
              value={draft.happenedOn}
              max={toDayValue(new Date())}
              onChange={(event) => onChange({ happenedOn: event.target.value })}
            />
          </Field>
          {!isLost && (
            <Field
              label="Вопрос хозяину"
              htmlFor="lost-question"
              optional
              hint="Например: «Что на брелоке?» Ответ увидите только вы и сами решите, верить ли."
            >
              <Input
                id="lost-question"
                value={draft.question}
                maxLength={QUESTION_MAX}
                onChange={(event) => onChange({ question: event.target.value })}
                placeholder="Что на брелоке?"
              />
            </Field>
          )}
          <Field
            label="Фото"
            optional
            hint="До трёх фото. Без документов с данными и номеров карт."
          >
            <LostPhotos photos={draft.photos} onChange={(photos) => onChange({ photos })} />
          </Field>
          {error && (
            <p role="alert" className="text-sm text-danger-ink">
              {error}
            </p>
          )}
          {isLost && <EarlyMatches draft={draft} point={point} />}
        </div>
      </PanelLayout>
    </>
  );
}

function LostForm() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const kind: LostKind = params.get('kind') === 'found' ? 'found' : 'lost';
  const presetCategory = params.get('category');
  const [step, setStep] = useState<'point' | 'details'>('point');
  const [point, setPoint] = useState<LatLng | null>(null);
  const pledge = useHonestyPledge();
  const [draft, setDraft] = useState<Draft>(() => ({
    kind,
    category:
      presetCategory && presetCategory in LOST_CATEGORY_META
        ? (presetCategory as LostCategory)
        : '',
    title: params.get('title') ?? '',
    description: '',
    happenedOn: params.get('on') ?? toDayValue(new Date()),
    question: '',
    photos: [],
    radius: DEFAULT_RADIUS,
  }));
  const change = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  if (step === 'details' && point) {
    return (
      <DetailsStep
        draft={draft}
        point={point}
        pledge={pledge}
        onChange={change}
        onBack={() => setStep('point')}
      />
    );
  }
  return (
    <PointStep
      kind={draft.kind}
      initial={point}
      radius={draft.radius}
      onRadius={(radius) => change({ radius })}
      onBack={() => navigate('/lost')}
      onConfirm={(picked) => {
        setPoint(picked);
        setStep('details');
      }}
    />
  );
}

/** `/lost/new?kind=lost|found` — a new post: the place first, then what and when. */
export default function LostEditor() {
  return (
    <RequireAuth reason="чтобы подать объявление">
      <LostForm />
    </RequireAuth>
  );
}
