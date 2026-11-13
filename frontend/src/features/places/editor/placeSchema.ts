import { z } from 'zod';

import type { Layer } from '@/shared/api';

const optionalInt = (min: number, max: number, message: string) =>
  z.string().refine((value) => {
    if (value.trim() === '') return true;
    const number = Number(value);
    return Number.isInteger(number) && number >= min && number <= max;
  }, message);

const eventSchema = z
  .object({
    starts_at: z.string().min(1, 'Укажите начало'),
    ends_at: z.string().min(1, 'Укажите окончание'),
    is_meetup: z.boolean(),
    capacity: optionalInt(1, 100_000, 'Целое число больше нуля'),
    price: optionalInt(0, 1_000_000, 'Цена в рублях, 0 — бесплатно'),
    age_limit: optionalInt(0, 21, 'От 0 до 21'),
    registration_url: z
      .string()
      .trim()
      .refine(
        (value) => value === '' || /^https?:\/\/\S+$/.test(value),
        'Ссылка должна начинаться с http:// или https://',
      ),
    contact: z.string().max(200, 'Не длиннее 200 символов'),
    repeat: z.boolean(),
    repeat_interval: optionalInt(1, 30, 'От 1 до 30 дней'),
    repeat_count: optionalInt(2, 12, 'От 2 до 12 раз'),
  })
  .superRefine((event, context) => {
    const start = new Date(event.starts_at).getTime();
    const end = new Date(event.ends_at).getTime();
    if (end <= start)
      context.addIssue({
        code: 'custom',
        path: ['ends_at'],
        message: 'Окончание должно быть позже начала',
      });
    else if (end <= Date.now())
      context.addIssue({ code: 'custom', path: ['ends_at'], message: 'Событие уже закончилось' });
    if (event.repeat && (!event.repeat_interval || !event.repeat_count)) {
      context.addIssue({
        code: 'custom',
        path: ['repeat_interval'],
        message: 'Укажите интервал и число повторов',
      });
    }
  });

const baseSchema = z.object({
  title: z.string().trim().min(3, 'Минимум 3 символа').max(120, 'Не длиннее 120 символов'),
  description: z.string().max(5000, 'Не длиннее 5000 символов'),
  address: z.string().max(200, 'Не длиннее 200 символов'),
  tips: z.string().max(2000, 'Не длиннее 2000 символов'),
  tags: z.array(z.string()).max(8, 'Не больше 8 тегов'),
  // A fact shown but left unanswered arrives as `undefined` — the same «не указано» as `null`.
  attributes: z.record(z.string(), z.union([z.string(), z.boolean(), z.null()]).optional()),
  issue: z.object({
    severity: z.enum(['low', 'medium', 'high']),
    radius: optionalInt(50, 5000, 'От 50 до 5000 метров'),
  }),
});

/** Validation matches API.md limits; event rules apply only on the event layer. */
export function placeSchema(layer: Layer) {
  return baseSchema.extend({ event: layer === 'event' ? eventSchema : z.any() });
}
