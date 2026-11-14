import { useCallback, useRef, useState, type RefObject } from 'react';

/**
 * «Я подтверждаю, что всё правда» in a neighbour's voice. Each line fits any kind of publication
 * (place, event, problem, route, quest, lost-and-found post) and any speaker: no «место» or
 * «событие», no gendered past tense. At most two lines at 360 px.
 */
const HONESTY_PHRASES = [
  'Мамой клянусь, что предоставляю достоверную информацию',
  'Зуб даю: всё так и есть',
  'Честное пионерское — ничего не выдумано',
  'Клянусь корюшкой: всё проверено лично',
  'Слово жителя Владивостока: это правда',
  'Положа руку на сердце: информация верная',
  'Клянусь пянсе: ни капли не приукрашено',
  'Чтоб мне в тумане маяка не найти, если здесь неправда',
  'Клянусь Золотым мостом: всё как есть',
  'Это так же верно, как туман в июле',
] as const;

let lastPhrase = -1;

/** A random line, never the one the previous form showed. */
function pickPhrase(): string {
  let index = Math.floor(Math.random() * HONESTY_PHRASES.length);
  if (index === lastPhrase) index = (index + 1) % HONESTY_PHRASES.length;
  lastPhrase = index;
  return HONESTY_PHRASES[index] ?? HONESTY_PHRASES[0];
}

export interface HonestyPledge {
  phrase: string;
  checked: boolean;
  setChecked: (checked: boolean) => void;
  /** Publishing was pressed without the tick: the reason is shown next to the box. */
  nudged: boolean;
  /** `true` when ticked; otherwise shows the reason and brings the box into view and focus. */
  confirm: () => boolean;
  inputRef: RefObject<HTMLInputElement | null>;
}

/**
 * The pledge of one form session: the phrase is drawn once, the tick starts empty. Keep it in
 * the component that lives as long as the form (not in a step), and never in a draft.
 */
export function useHonestyPledge(): HonestyPledge {
  const [phrase] = useState(pickPhrase);
  const [checked, setCheckedState] = useState(false);
  const [nudged, setNudged] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const setChecked = useCallback((value: boolean) => {
    setCheckedState(value);
    if (value) setNudged(false);
  }, []);

  const confirm = useCallback(() => {
    if (checked) return true;
    setNudged(true);
    const input = inputRef.current;
    // `nearest`: the box usually sits in a sticky footer, already in view — nothing must shift.
    input?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    input?.focus({ preventScroll: true });
    return false;
  }, [checked]);

  return { phrase, checked, setChecked, nudged, confirm, inputRef };
}
