import { cn } from '../lib/cn';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return <div aria-hidden className={cn('skeleton rounded-lg', className)} />;
}

/** Placeholder rows matching `PlaceListItem` geometry. */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" role="status" aria-label="Загрузка">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex gap-3.5 rounded-card border border-line/70 bg-surface p-3">
          <Skeleton className="size-24 shrink-0 rounded-control" />
          <div className="flex flex-1 flex-col justify-center gap-2.5">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-5 w-28 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
