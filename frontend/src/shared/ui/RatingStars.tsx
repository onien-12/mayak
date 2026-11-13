import { Star } from 'lucide-react';
import { useState } from 'react';

import { cn } from '../lib/cn';

const STARS = [1, 2, 3, 4, 5] as const;
const RATING_WORDS = ['', 'Плохо', 'Так себе', 'Нормально', 'Хорошо', 'Отлично'] as const;

interface RatingStarsProps {
  value: number;
  size?: number;
  className?: string;
}

/** Read-only stars; fractional values are rounded to the nearest star. */
export function RatingStars({ value, size = 14, className }: RatingStarsProps) {
  const rounded = Math.round(value);
  return (
    <span
      role="img"
      aria-label={`Оценка ${value.toFixed(1).replace('.', ',')} из 5`}
      className={cn('inline-flex gap-0.5', className)}
    >
      {STARS.map((star) => (
        <Star
          key={star}
          size={size}
          aria-hidden
          className={star <= rounded ? 'fill-beam text-beam' : 'fill-line text-line'}
        />
      ))}
    </span>
  );
}

interface RatingInputProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

export function RatingInput({ value, onChange, disabled }: RatingInputProps) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="flex items-center gap-3">
      <div
        role="radiogroup"
        aria-label="Ваша оценка"
        className="flex"
        onMouseLeave={() => setHover(0)}
      >
        {STARS.map((star) => (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} из 5`}
            disabled={disabled}
            onMouseEnter={() => setHover(star)}
            onClick={() => onChange(star)}
            className="inline-flex size-11 items-center justify-center rounded-lg transition-transform hover:scale-110 active:scale-90"
          >
            <Star
              size={26}
              aria-hidden
              className={cn(
                'transition-colors',
                star <= shown ? 'fill-beam text-beam' : 'fill-transparent text-ink-faint/50',
              )}
            />
          </button>
        ))}
      </div>
      <span className="text-sm text-ink-soft">{RATING_WORDS[shown]}</span>
    </div>
  );
}
