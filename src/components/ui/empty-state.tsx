import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center px-4 py-10 text-center",
        className,
      )}
    >
      {Icon && (
        <div className="mb-3 grid size-11 place-items-center rounded-full bg-muted text-primary">
          <Icon className="size-5" strokeWidth={1.75} />
        </div>
      )}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
