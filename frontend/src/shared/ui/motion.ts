import type { Transition, Variants } from 'motion/react';

/**
 * Motion presets — the single source of timing for the whole app. Springs are critically
 * damped (no bounce); tweens stay within 150–350 ms. Animate `transform` / `opacity` only.
 */
export const SPRING = {
  /** Bottom sheet, side panel, overlay pages. */
  sheet: { type: 'spring', stiffness: 420, damping: 42, mass: 1 },
  /** Shared-layout indicators: tab marker, segmented thumb, cover → card. */
  layout: { type: 'spring', stiffness: 520, damping: 44, mass: 0.9 },
  /** Small pops: markers, badges, hearts. */
  pop: { type: 'spring', stiffness: 560, damping: 26, mass: 0.7 },
  /** Gentle value changes: meters, counters. */
  soft: { type: 'spring', stiffness: 170, damping: 26 },
} as const satisfies Record<string, Transition>;

export const EASE_OUT = [0.22, 0.8, 0.3, 1] as const;

export const TWEEN = {
  fast: { duration: 0.15, ease: EASE_OUT },
  base: { duration: 0.22, ease: EASE_OUT },
  slow: { duration: 0.32, ease: EASE_OUT },
} as const satisfies Record<string, Transition>;

/** Scale applied to tappable surfaces while pressed. */
export const PRESS_SCALE = 0.97;
/** Delay between consecutive list items in a staggered entrance, seconds. */
export const STAGGER_STEP = 0.035;
/** Items after this index appear together (long lists must not feel slow). */
export const STAGGER_LIMIT = 8;

export const fadeVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: TWEEN.base },
  exit: { opacity: 0, transition: TWEEN.fast },
};

export const riseVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: SPRING.sheet },
  exit: { opacity: 0, y: 8, transition: TWEEN.fast },
};

export const popVariants: Variants = {
  hidden: { opacity: 0, scale: 0.94 },
  visible: { opacity: 1, scale: 1, transition: SPRING.sheet },
  exit: { opacity: 0, scale: 0.97, transition: TWEEN.fast },
};

/** Panel-level push: a screen slides in from the right over the previous one. */
export const pushVariants: Variants = {
  hidden: { opacity: 0, x: 28 },
  visible: { opacity: 1, x: 0, transition: SPRING.sheet },
  exit: { opacity: 0, x: 28, transition: TWEEN.fast },
};
