import { Controller, useFormContext, useWatch } from 'react-hook-form';

import { toLocalInputValue } from '@/shared/lib/format';
import { Field, Input, Switch } from '@/shared/ui';

import type { PlaceFormValues } from './placeForm';

const DEFAULT_DURATION_MS = 2 * 3_600_000;

/** Event-only fields: time (required), then price, seats and the meetup / repeat options. */
export function EventFields({ allowRepeat }: { allowRepeat: boolean }) {
  const {
    control,
    register,
    getValues,
    setValue,
    formState: { errors, isSubmitted },
  } = useFormContext<PlaceFormValues>();

  /** Moving the start moves the end with it: the event keeps its length. */
  const followStart = (before: string, value: string) => {
    const start = new Date(value).getTime();
    if (Number.isNaN(start)) return;
    const length = new Date(getValues('event.ends_at')).getTime() - new Date(before).getTime();
    setValue(
      'event.ends_at',
      toLocalInputValue(new Date(start + (length > 0 ? length : DEFAULT_DURATION_MS))),
      { shouldDirty: true, shouldValidate: isSubmitted },
    );
  };
  const isMeetup = useWatch({ control, name: 'event.is_meetup' });
  const repeat = useWatch({ control, name: 'event.repeat' });
  const error = errors.event;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Начало" htmlFor="event-start" error={error?.starts_at?.message}>
          <Controller
            control={control}
            name="event.starts_at"
            render={({ field }) => (
              <Input
                id="event-start"
                type="datetime-local"
                invalid={Boolean(error?.starts_at)}
                {...field}
                onChange={(event) => {
                  field.onChange(event);
                  followStart(field.value, event.target.value);
                }}
              />
            )}
          />
        </Field>
        <Field label="Окончание" htmlFor="event-end" error={error?.ends_at?.message}>
          <Input
            id="event-end"
            type="datetime-local"
            invalid={Boolean(error?.ends_at)}
            {...register('event.ends_at')}
          />
        </Field>
      </div>

      <Controller
        control={control}
        name="event.is_meetup"
        render={({ field }) => (
          <Switch
            checked={field.value}
            onChange={field.onChange}
            label="Небольшая встреча"
            description="Игра, прогулка, субботник — контакт увидят только участники"
          />
        )}
      />

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Цена, ₽"
          htmlFor="event-price"
          hint="Пусто — бесплатно"
          error={error?.price?.message}
        >
          <Input
            id="event-price"
            inputMode="numeric"
            placeholder="0"
            invalid={Boolean(error?.price)}
            {...register('event.price')}
          />
        </Field>
        <Field
          label="Мест"
          htmlFor="event-capacity"
          hint="Пусто — без ограничений"
          error={error?.capacity?.message}
        >
          <Input
            id="event-capacity"
            inputMode="numeric"
            invalid={Boolean(error?.capacity)}
            {...register('event.capacity')}
          />
        </Field>
      </div>

      {isMeetup ? (
        <Field
          label="Как с вами связаться"
          htmlFor="event-contact"
          optional
          error={error?.contact?.message}
        >
          <Input
            id="event-contact"
            placeholder="Телеграм или телефон"
            {...register('event.contact')}
          />
        </Field>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Возраст, от" htmlFor="event-age" optional error={error?.age_limit?.message}>
            <Input
              id="event-age"
              inputMode="numeric"
              placeholder="0"
              invalid={Boolean(error?.age_limit)}
              {...register('event.age_limit')}
            />
          </Field>
          <Field
            label="Ссылка на регистрацию"
            htmlFor="event-url"
            optional
            error={error?.registration_url?.message}
          >
            <Input
              id="event-url"
              type="url"
              inputMode="url"
              placeholder="https://"
              invalid={Boolean(error?.registration_url)}
              {...register('event.registration_url')}
            />
          </Field>
        </div>
      )}

      {allowRepeat && (
        <>
          <Controller
            control={control}
            name="event.repeat"
            render={({ field }) => (
              <Switch
                checked={field.value}
                onChange={field.onChange}
                label="Повторяется"
                description="Создадим серию одинаковых событий"
              />
            )}
          />
          {repeat && (
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Каждые, дней"
                htmlFor="event-interval"
                error={error?.repeat_interval?.message}
              >
                <Input
                  id="event-interval"
                  inputMode="numeric"
                  invalid={Boolean(error?.repeat_interval)}
                  {...register('event.repeat_interval')}
                />
              </Field>
              <Field label="Сколько раз" htmlFor="event-count" error={error?.repeat_count?.message}>
                <Input
                  id="event-count"
                  inputMode="numeric"
                  invalid={Boolean(error?.repeat_count)}
                  {...register('event.repeat_count')}
                />
              </Field>
            </div>
          )}
        </>
      )}
    </div>
  );
}
