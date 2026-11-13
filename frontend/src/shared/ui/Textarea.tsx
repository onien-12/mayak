import type { Ref, TextareaHTMLAttributes } from 'react';

import { cn } from '../lib/cn';
import { controlClasses } from './Input';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  ref?: Ref<HTMLTextAreaElement>;
}

export function Textarea({ invalid, className, rows = 3, ...rest }: TextareaProps) {
  return (
    <textarea
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(controlClasses, 'min-h-11 resize-y px-3.5 py-2.5 leading-snug', className)}
      {...rest}
    />
  );
}
