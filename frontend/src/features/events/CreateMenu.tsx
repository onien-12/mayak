import {
  CalendarPlus,
  ChevronUp,
  Gift,
  HandHelping,
  Plus,
  Presentation,
  Users,
  type LucideIcon,
} from 'lucide-react';

import { Button, Dropdown, DropdownItem, DropdownSeparator } from '@/shared/ui';

import { startCreateEvent, type CreateKind } from './startCreateEvent';

interface Choice {
  kind: CreateKind;
  icon: LucideIcon;
  title: string;
  hint: string;
}

/** What residents arrange themselves comes first; a bigger event and a venue close the list. */
const CHOICES: readonly Choice[] = [
  {
    kind: 'meetup',
    icon: Users,
    title: 'Встреча',
    hint: 'Игра, прогулка, субботник',
  },
  { kind: 'swap', icon: Gift, title: 'Раздача', hint: 'Отдать вещи, обменяться своими' },
  {
    kind: 'help',
    icon: HandHelping,
    title: 'Нужна помощь',
    hint: 'Перенести, починить, подсказать',
  },
  {
    kind: 'event',
    icon: CalendarPlus,
    title: 'Событие побольше',
    hint: 'Концерт, лекция, праздник',
  },
];

function ChoiceItem({ kind, icon, title, hint }: Choice) {
  return (
    <DropdownItem icon={icon} onSelect={() => startCreateEvent(kind)}>
      <span className="flex min-w-0 flex-col py-1.5 leading-tight">
        <span>{title}</span>
        <span className="text-xs font-normal text-ink-faint">{hint}</span>
      </span>
    </DropdownItem>
  );
}

/** «Создать» in the footer of «События»: one control, the formats behind it. */
export function CreateMenu() {
  return (
    <Dropdown
      label="Что создать"
      placement="top-start"
      className="lg:min-w-72"
      trigger={(props, { open }) => (
        <Button {...props} block icon={Plus}>
          Создать
          <ChevronUp
            size={16}
            aria-hidden
            className={`transition-transform duration-200 ${open ? '' : 'rotate-180'}`}
          />
        </Button>
      )}
    >
      {CHOICES.map((choice) => (
        <ChoiceItem key={choice.kind} {...choice} />
      ))}
      <DropdownSeparator />
      <ChoiceItem
        kind="venue"
        icon={Presentation}
        title="Предложить площадку"
        hint="Помещение, где можно проводить встречи"
      />
    </Dropdown>
  );
}
