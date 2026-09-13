import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";

export function AppErrorComponent({ error }: ErrorComponentProps) {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-6 text-center text-foreground">
      <div className="animate-page-enter max-w-md">
        <div className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-danger-soft text-danger">
          <TriangleAlert className="size-6" strokeWidth={2} />
        </div>
        <h1 className="text-lg font-semibold">うまく表示できませんでした</h1>
        <p className="mt-2 text-sm break-words text-muted-foreground">
          {error.message ||
            "予期しないエラーです。ページを再読み込みしてください。"}
        </p>
        <button
          type="button"
          className="mt-5 inline-flex h-10 items-center justify-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
          onClick={() => window.location.reload()}
        >
          再読み込み
        </button>
      </div>
    </main>
  );
}
