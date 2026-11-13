import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import type { Collection } from '@/shared/api';
import { applyServerErrors } from '@/shared/lib/serverErrors';
import { Banner, Button, Field, Input, Modal, Switch, Textarea } from '@/shared/ui';

import { useSaveCollection } from './useCollections';

const TITLE_MAX = 80;
const DESCRIPTION_MAX = 1000;

const schema = z.object({
  title: z
    .string()
    .trim()
    .min(3, 'Не короче 3 символов')
    .max(TITLE_MAX, `Не длиннее ${TITLE_MAX} символов`),
  description: z.string().trim().max(DESCRIPTION_MAX, `Не длиннее ${DESCRIPTION_MAX} символов`),
  is_public: z.boolean(),
});

type CollectionValues = z.infer<typeof schema>;

const toValues = (collection?: Collection): CollectionValues => ({
  title: collection?.title ?? '',
  description: collection?.description ?? '',
  is_public: collection?.is_public ?? false,
});

interface CollectionDialogProps {
  open: boolean;
  onClose: () => void;
  /** Edit this collection; create a new one when omitted. */
  collection?: Collection;
  onSaved?: (collection: Collection) => void;
}

/** Create / edit a collection: title, description, public or private. */
export function CollectionDialog({ open, onClose, collection, onSaved }: CollectionDialogProps) {
  const save = useSaveCollection(collection);
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<CollectionValues>({
    resolver: zodResolver(schema),
    defaultValues: toValues(collection),
  });

  useEffect(() => {
    if (open) reset(toValues(collection));
  }, [open, collection, reset]);

  const submit = handleSubmit((values) =>
    save.mutate(values, {
      onSuccess: (saved) => {
        onSaved?.(saved);
        onClose();
      },
      onError: (error) => applyServerErrors(error, setError, ['title', 'description']),
    }),
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={collection ? 'Редактировать подборку' : 'Новая подборка'}
      description={
        collection ? undefined : 'Соберите места по теме: «куда сводить гостей», «мои закаты»…'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" form="collection-form" loading={save.isPending}>
            {collection ? 'Сохранить' : 'Создать'}
          </Button>
        </>
      }
    >
      <form id="collection-form" noValidate onSubmit={submit} className="flex flex-col gap-4">
        {errors.root && <Banner tone="danger">{errors.root.message}</Banner>}
        <Field label="Название" htmlFor="collection-title" error={errors.title?.message}>
          <Input
            id="collection-title"
            maxLength={TITLE_MAX}
            placeholder="Например: Кофе с видом на море"
            invalid={Boolean(errors.title)}
            data-autofocus
            {...register('title')}
          />
        </Field>
        <Field
          label="Описание"
          htmlFor="collection-description"
          optional
          error={errors.description?.message}
        >
          <Textarea
            id="collection-description"
            rows={3}
            maxLength={DESCRIPTION_MAX}
            placeholder="О чём подборка и кому пригодится"
            invalid={Boolean(errors.description)}
            {...register('description')}
          />
        </Field>
        <Controller
          control={control}
          name="is_public"
          render={({ field }) => (
            <Switch
              checked={field.value}
              onChange={field.onChange}
              label="Видна всем"
              description={
                field.value
                  ? 'Подборка появится среди подборок жителей'
                  : 'Только вы увидите эту подборку'
              }
            />
          )}
        />
      </form>
    </Modal>
  );
}
