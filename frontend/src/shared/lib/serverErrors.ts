import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';

import { ApiError, errorMessage } from '../api/client';

/**
 * Maps a failed request onto a form: 422 field errors go under their inputs, everything
 * else becomes the form-level `root` error.
 */
export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
): void {
  let matched = false;
  if (error instanceof ApiError) {
    for (const item of error.errors) {
      const field = fields.find((name) => name === item.field || item.field.endsWith(`.${name}`));
      if (field) {
        setError(field, { type: 'server', message: item.message });
        matched = true;
      }
    }
  }
  if (!matched) setError('root', { type: 'server', message: errorMessage(error) });
}
