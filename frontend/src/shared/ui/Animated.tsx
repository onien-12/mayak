import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type HTMLMotionProps,
} from 'motion/react';
import { useEffect, type ReactNode } from 'react';

import { cn } from '../lib/cn';
import { formatNumber } from '../lib/format';
import { useLiteGraphics } from './graphics';
import { PRESS_SCALE, riseVariants, SPRING, STAGGER_LIMIT, STAGGER_STEP, TWEEN } from './motion';

interface RiseProps extends HTMLMotionProps<'div'> {
  /** Entrance delay in seconds. */
  delay?: number;
}

/** Fades and lifts its content into place on mount (lite graphics: a plain fade, no delay). */
export function Rise({ delay = 0, children, ...rest }: RiseProps) {
  const lite = useLiteGraphics();

  return (
    <motion.div
      variants={riseVariants}
      initial="hidden"
      animate="visible"
      transition={{ ...SPRING.sheet, delay: lite ? 0 : delay }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

interface StaggerItemProps extends HTMLMotionProps<'li'> {
  /** Position in the list — sets the entrance delay (capped, so long lists stay fast). */
  index: number;
}

/**
 * List item with a staggered entrance. Only newly mounted items animate, so a list that
 * refreshes in place (e.g. while the map moves) stays calm. Use inside `<ul>`.
 * Lite graphics: all items fade in together.
 */
export function StaggerItem({ index, children, ...rest }: StaggerItemProps) {
  const lite = useLiteGraphics();
  const delay = lite ? 0 : Math.min(index, STAGGER_LIMIT) * STAGGER_STEP;

  return (
    <motion.li
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING.sheet, delay }}
      {...rest}
    >
      {children}
    </motion.li>
  );
}

/** Wrapper that gives any block press feedback (scale 0.97) — for tappable cards. */
export function Pressable({ children, className, ...rest }: HTMLMotionProps<'div'>) {
  return (
    <motion.div
      whileTap={{ scale: PRESS_SCALE }}
      transition={TWEEN.fast}
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

interface AnimatedNumberProps {
  value: number;
  /** Count up from zero on mount (statistics); otherwise only changes are animated. */
  countUp?: boolean;
  className?: string;
}

/** A number that ticks to its new value instead of jumping. */
export function AnimatedNumber({ value, countUp = false, className }: AnimatedNumberProps) {
  const reduced = useReducedMotion();
  const current = useMotionValue(countUp && !reduced ? 0 : value);
  const text = useTransform(current, (latest) => formatNumber(Math.round(latest)));

  useEffect(() => {
    if (reduced) {
      current.set(value);
      return;
    }
    const controls = animate(current, value, SPRING.soft);
    return () => controls.stop();
  }, [current, value, reduced]);

  return <motion.span className={cn('tabular-nums', className)}>{text}</motion.span>;
}

interface PopProps {
  /** Changing this value replays the pop (e.g. `isFavorite`, vote kind). */
  trigger: string | number | boolean;
  className?: string;
  children: ReactNode;
}

/** Micro-interaction: the content pops every time `trigger` changes. */
export function Pop({ trigger, className, children }: PopProps) {
  return (
    <motion.span
      key={String(trigger)}
      initial={{ scale: 0.6 }}
      animate={{ scale: 1 }}
      transition={SPRING.pop}
      className={cn('inline-flex', className)}
    >
      {children}
    </motion.span>
  );
}

interface SuccessCheckProps {
  size?: number;
  className?: string;
}

/** Calm success mark: a lighthouse beam sweeps once while the check draws itself. */
export function SuccessCheck({ size = 96, className }: SuccessCheckProps) {
  return (
    <svg
      role="img"
      aria-label="Готово"
      viewBox="0 0 96 96"
      width={size}
      height={size}
      className={cn('overflow-visible', className)}
    >
      <motion.path
        d="M48 48 96 26v44Z"
        fill="var(--color-beam)"
        style={{ originX: '48px', originY: '48px' }}
        initial={{ rotate: -150, opacity: 0 }}
        animate={{ rotate: 20, opacity: [0, 0.7, 0.7, 0] }}
        transition={{ duration: 0.9, ease: 'easeInOut' }}
      />
      <motion.circle
        cx="48"
        cy="48"
        r="30"
        fill="var(--color-success)"
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={SPRING.sheet}
      />
      <motion.path
        d="M35 49.5 44.5 59 62 40"
        fill="none"
        stroke="#fff"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.35, delay: 0.25, ease: 'easeOut' }}
      />
    </svg>
  );
}
