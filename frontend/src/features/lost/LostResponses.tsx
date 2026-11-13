import { Check, Lock, MessageSquareReply, Phone, X } from 'lucide-react';
import { useState } from 'react';

import type { LostItem, LostResponse } from '@/shared/api';
import { cn } from '@/shared/lib/cn';
import { formatRelative } from '@/shared/lib/format';
import {
  Button,
  Field,
  Input,
  ListSkeleton,
  Modal,
  OnReviewMark,
  Textarea,
  UserChip,
} from '@/shared/ui';

import { lostErrorMessage, useDecideResponse, useLostResponses, useRespond } from './useLost';

const MESSAGE_MAX = 1000;
const CONTACT_MIN = 3;
const CONTACT_MAX = 200;
const CONTACT_HINT = 'Телефон, Telegram или другой способ связи.';

/** The other side's contact, shown once the response is accepted. */
function ContactLine({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex items-center gap-2 rounded-control bg-success-soft px-3 py-2 text-sm text-success-ink">
      <Phone size={15} aria-hidden className="shrink-0" />
      <span>
        {label}: <span className="font-semibold select-all">{value}</span>
      </span>
    </p>
  );
}

interface RespondDialogProps {
  item: LostItem;
  open: boolean;
  onClose: () => void;
}

/** «Это моё» / «Я нашёл это»: a message (with the answer to the control question) and a contact. */
export function RespondDialog({ item, open, onClose }: RespondDialogProps) {
  const respond = useRespond(item.id);
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const [error, setError] = useState<string | null>(null);
  const isFound = item.kind === 'found';
  const ready = message.trim().length > 0 && contact.trim().length >= CONTACT_MIN;

  const send = () => {
    setError(null);
    respond.mutate(
      { message: message.trim(), contact: contact.trim() },
      { onSuccess: onClose, onError: (failure) => setError(lostErrorMessage(failure)) },
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isFound ? 'Это моё' : 'Я нашёл это'}
      description="Отклик увидит только автор объявления."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button
            icon={MessageSquareReply}
            disabled={!ready}
            loading={respond.isPending}
            onClick={send}
          >
            Отправить
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {isFound && item.control_question && (
          <p className="rounded-control bg-beam-soft px-3 py-2 text-sm text-ink">
            Автор спрашивает: <span className="font-semibold">«{item.control_question}»</span>
          </p>
        )}
        <Field
          label={isFound && item.control_question ? 'Ваш ответ и сообщение' : 'Сообщение'}
          htmlFor="lost-response-message"
          hint={
            isFound
              ? 'Опишите приметы, которых нет в объявлении, — так автор поймёт, что вещь ваша.'
              : 'Где и когда нашли, где вещь сейчас.'
          }
        >
          <Textarea
            id="lost-response-message"
            rows={4}
            maxLength={MESSAGE_MAX}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            data-autofocus
          />
        </Field>
        <Field label="Как с вами связаться" htmlFor="lost-response-contact" hint={CONTACT_HINT}>
          <Input
            id="lost-response-contact"
            value={contact}
            maxLength={CONTACT_MAX}
            onChange={(event) => setContact(event.target.value)}
            placeholder="+7 914 … или @telegram"
            autoComplete="tel"
          />
        </Field>
        <p className="flex gap-2 text-xs text-ink-soft">
          <Lock size={14} aria-hidden className="mt-px shrink-0" />
          Контакт нигде не публикуется. Автор увидит его, только если примет отклик, — тогда и вы
          увидите его контакт.
        </p>
        {error && (
          <p role="alert" className="text-sm text-danger-ink">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

/** What the responder sees of their own response. */
export function MyResponse({ response }: { response: LostResponse }) {
  return (
    <section className="flex flex-col gap-2 rounded-card border border-line/70 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">Ваш отклик</h2>
        <span className="text-xs text-ink-faint">{formatRelative(response.created_at)}</span>
      </div>
      {response.on_review && <OnReviewMark className="self-start" />}
      <p className="text-sm whitespace-pre-line text-ink">{response.message}</p>
      {response.state === 'pending' && (
        <p className="text-sm text-ink-soft">
          Ждём ответа автора. Ваш контакт ({response.contact}) он увидит, только если примет отклик.
        </p>
      )}
      {response.state === 'declined' && (
        <p className="text-sm text-ink-soft">Автор ответил, что это не то.</p>
      )}
      {response.state === 'accepted' && response.owner_contact && (
        <ContactLine label="Контакт автора" value={response.owner_contact} />
      )}
    </section>
  );
}

function AcceptDialog({
  response,
  onClose,
}: {
  response: LostResponse | null;
  onClose: () => void;
}) {
  const decide = useDecideResponse();
  const [contact, setContact] = useState('');
  const [error, setError] = useState<string | null>(null);

  const accept = () => {
    if (!response) return;
    setError(null);
    decide.mutate(
      { id: response.id, contact: contact.trim() },
      { onSuccess: onClose, onError: (failure) => setError(lostErrorMessage(failure)) },
    );
  };

  return (
    <Modal
      open={response !== null}
      onClose={onClose}
      title="Принять отклик"
      description="Вы увидите контакт этого человека, а он — ваш. Больше никто."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button
            icon={Check}
            disabled={contact.trim().length < CONTACT_MIN}
            loading={decide.isPending}
            onClick={accept}
          >
            Принять
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Ваш контакт" htmlFor="lost-accept-contact" hint={CONTACT_HINT}>
          <Input
            id="lost-accept-contact"
            value={contact}
            maxLength={CONTACT_MAX}
            onChange={(event) => setContact(event.target.value)}
            placeholder="+7 914 … или @telegram"
            autoComplete="tel"
            data-autofocus
          />
        </Field>
        {error && (
          <p role="alert" className="text-sm text-danger-ink">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

const STATE_LABELS: Record<LostResponse['state'], string> = {
  pending: 'Ждёт ответа',
  accepted: 'Принят',
  declined: 'Отклонён',
};

function ResponseRow({
  response,
  onAccept,
}: {
  response: LostResponse;
  onAccept: (response: LostResponse) => void;
}) {
  const decide = useDecideResponse();
  return (
    <article className="flex flex-col gap-2 rounded-card border border-line/70 p-3">
      <div className="flex items-center justify-between gap-2">
        <UserChip user={response.author} size="sm" caption={formatRelative(response.created_at)} />
        <span
          className={cn(
            'shrink-0 text-xs font-medium',
            response.state === 'accepted' ? 'text-success-ink' : 'text-ink-faint',
          )}
        >
          {STATE_LABELS[response.state]}
        </span>
      </div>
      <p className="text-sm whitespace-pre-line text-ink">{response.message}</p>
      {response.state === 'accepted' && response.contact && (
        <ContactLine label="Контакт" value={response.contact} />
      )}
      {response.state === 'pending' && (
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            icon={X}
            loading={decide.isPending}
            onClick={() => decide.mutate({ id: response.id, contact: null })}
          >
            Не то
          </Button>
          <Button icon={Check} onClick={() => onAccept(response)}>
            Принять
          </Button>
        </div>
      )}
    </article>
  );
}

/** Responses to the author's own post: read, then accept (contacts open) or decline. */
export function ResponsesBlock({ item }: { item: LostItem }) {
  const responses = useLostResponses(item);
  const [accepting, setAccepting] = useState<LostResponse | null>(null);

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-ink">
        Отклики{' '}
        {item.pending_responses > 0 && (
          <span className="font-normal text-ink-soft">· ждут ответа: {item.pending_responses}</span>
        )}
      </h2>
      {responses.isPending ? (
        <ListSkeleton rows={1} />
      ) : responses.data && responses.data.length > 0 ? (
        responses.data.map((response) => (
          <ResponseRow key={response.id} response={response} onAccept={setAccepting} />
        ))
      ) : (
        <p className="text-sm text-ink-soft">
          {item.kind === 'found'
            ? 'Пока никто не откликнулся. Когда хозяин напишет, придёт уведомление.'
            : 'Пока никто не откликнулся. Когда кто-то напишет, придёт уведомление.'}
        </p>
      )}
      <AcceptDialog response={accepting} onClose={() => setAccepting(null)} />
    </section>
  );
}
