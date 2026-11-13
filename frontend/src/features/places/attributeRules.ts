import type { AttributeValue } from '@/shared/api';

type Answers = Record<string, AttributeValue | null | undefined>;

/** Facts that another answer makes pointless: a free place has no price to state. */
const POINTLESS_WHEN: Record<string, { key: string; value: AttributeValue }> = {
  price: { key: 'free', value: true },
};

/** Whether the fact `key` is worth asking for and showing, given the other answers. */
export function isRelevantFact(key: string, answers: Answers): boolean {
  const rule = POINTLESS_WHEN[key];
  return !rule || answers[rule.key] !== rule.value;
}
