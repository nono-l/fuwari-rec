import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-md", className)} aria-hidden />;
}

export function SongRowSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <ul className="divide-y divide-border" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="h-3 w-5 shrink-0" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-[58%]" />
            <Skeleton className="h-3 w-[34%]" />
          </div>
          <Skeleton className="h-7 w-16 shrink-0 rounded-full" />
        </li>
      ))}
    </ul>
  );
}

export function PageSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="読み込み中">
      {Array.from({ length: cards }, (_, i) => (
        <Skeleton
          key={i}
          className={i === 0 ? "h-44 rounded-2xl" : "h-32 rounded-2xl"}
        />
      ))}
    </div>
  );
}
