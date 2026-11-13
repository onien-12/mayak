import {
  Building2,
  CalendarCheck,
  ExternalLink,
  FileText,
  Megaphone,
  Pencil,
  Radius,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useState } from 'react';

import { useAuth } from '@/features/auth';
import { MapCircle } from '@/features/map';
import type { IssueDetail, PlaceDetail } from '@/shared/api';
import { formatDate, formatDistance, formatRelative } from '@/shared/lib/format';
import { ISSUE_STAGE_META, SEVERITY_META } from '@/shared/lib/labels';
import { Badge, Button } from '@/shared/ui';

import { IssueStepper } from './IssueStepper';
import { OfficialInfoForm } from './OfficialInfoForm';
import { OutageInfo } from './OutageInfo';

const APPEAL_LINKS = [
  { href: 'https://www.vlc.ru/', label: 'Сайт администрации Владивостока' },
  { href: 'https://pos.gosuslugi.ru/landing/', label: 'Госуслуги «Решаем вместе»' },
] as const;

function OfficialInfo({ issue }: { issue: IssueDetail }) {
  const rows = [
    { icon: Building2, label: 'Отвечает', value: issue.responsible_org },
    {
      icon: CalendarCheck,
      label: 'Срок устранения',
      value: issue.expected_fix_at && formatDate(issue.expected_fix_at),
    },
    { icon: FileText, label: 'Номер обращения', value: issue.appeal_number },
  ].filter((row) => row.value);

  return (
    <div className="rounded-card border border-official/25 bg-official-soft p-3.5">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-official-ink">
        <ShieldCheck size={17} aria-hidden />
        Официальная информация
      </p>
      {issue.official_note && (
        <p className="mt-1.5 text-sm whitespace-pre-line text-ink">{issue.official_note}</p>
      )}
      {rows.length > 0 && (
        <dl className="mt-2.5 flex flex-col gap-1.5 text-sm">
          {rows.map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-center gap-2">
              <Icon size={15} aria-hidden className="shrink-0 text-official-ink" />
              <dt className="text-ink-soft">{label}:</dt>
              <dd className="min-w-0 truncate font-medium text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/** Issue block of the card: lifecycle, severity, source of information and how to escalate. */
export function IssueSection({ place }: { place: PlaceDetail }) {
  const { isModerator } = useAuth();
  const [editing, setEditing] = useState(false);
  const issue = place.issue;
  if (!issue) return null;

  const severity = SEVERITY_META[issue.severity];
  const resolved = issue.stage === 'resolved';
  const hasHouses = issue.outage_buildings.length > 0;

  return (
    <section aria-label="Проблема" className="flex flex-col gap-3">
      {issue.radius_m !== null && !resolved && !hasHouses && (
        <MapCircle center={place} radiusM={issue.radius_m} />
      )}

      <div className="rounded-card border border-line bg-surface p-3.5">
        <IssueStepper stage={issue.stage} />
        <p className="mt-1 text-sm text-ink-soft">{ISSUE_STAGE_META[issue.stage].description}.</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge tone={severity.tone} icon={severity.icon} size="md" title={severity.description}>
            {severity.label}
          </Badge>
          {issue.radius_m !== null && (
            <Badge tone="issue" icon={Radius} size="md">
              Затронуто в радиусе {formatDistance(issue.radius_m)}
            </Badge>
          )}
        </div>
        <p className="mt-2.5 text-xs text-ink-faint">
          Обнаружено {formatRelative(issue.detected_at)}
          {issue.resolved_at && ` · устранено ${formatRelative(issue.resolved_at)}`}
        </p>
      </div>

      {issue.outage ? (
        <OutageInfo place={place} outage={issue.outage} />
      ) : issue.source === 'official' ? (
        <OfficialInfo issue={issue} />
      ) : (
        <p className="flex items-start gap-2 rounded-card bg-canvas p-3.5 text-sm text-ink-soft">
          <Users size={17} aria-hidden className="mt-0.5 shrink-0" />
          <span>
            <span className="font-medium text-ink">Сообщение жителей.</span> Информация не
            подтверждена официально — ориентируйтесь на голоса ниже.
          </span>
        </p>
      )}

      {isModerator &&
        !issue.outage &&
        (editing ? (
          <OfficialInfoForm place={place} onDone={() => setEditing(false)} />
        ) : (
          <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>
            Этап и официальная информация
          </Button>
        ))}

      {!resolved && (
        <details className="group rounded-card border border-line bg-surface">
          <summary className="flex min-h-11 list-none items-center gap-2.5 px-3.5 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
            <Megaphone size={17} aria-hidden className="shrink-0 text-ink-soft" />
            Как подать официальное обращение
          </summary>
          <div className="flex flex-col gap-2 px-3.5 pb-3.5 text-sm text-ink-soft">
            <p>
              «Маяк» показывает, что видят жители, но не заменяет обращение в ответственные службы.
              Опишите проблему, приложите фото и адрес — обращение обязаны рассмотреть.
            </p>
            {APPEAL_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-11 items-center justify-between gap-2 rounded-control bg-canvas px-3 font-medium text-brand hover:bg-brand-soft"
              >
                {link.label}
                <ExternalLink size={15} aria-hidden className="shrink-0" />
              </a>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
