import { cn } from '../lib/cn';

interface AvatarProps {
  /** Seed for the generated gradient — the user id. */
  id: number;
  name: string;
  size?: number;
  className?: string;
}

const GOLDEN_ANGLE = 137.5;

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? '?';
  const second = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : '';
  return (first + second).toUpperCase();
}

/** Deterministic gradient avatar: the same user always gets the same colours. */
function avatarGradient(id: number): string {
  const hue = Math.round((id * GOLDEN_ANGLE) % 360);
  return `linear-gradient(135deg, hsl(${hue} 78% 62%), hsl(${(hue + 48) % 360} 72% 44%))`;
}

export function Avatar({ id, name, size = 36, className }: AvatarProps) {
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        background: avatarGradient(id),
      }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-tight text-white select-none',
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
