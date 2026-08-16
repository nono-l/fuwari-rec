import { useEffect, type ReactNode } from "react";
import { AppHeader } from "@/components/editor/app-header";
import { AppNav } from "@/components/editor/app-nav";
import { TransportBar } from "@/components/editor/transport-bar";
import { useEditorStore } from "@/lib/store/editor-store";

export function AppShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const initEngine = useEditorStore((s) => s.initEngine);
  const togglePlay = useEditorStore((s) => s.togglePlay);
  const toggleRecord = useEditorStore((s) => s.toggleRecord);
  const stop = useEditorStore((s) => s.stop);
  const tapActive = useEditorStore((s) => s.tapActive);
  const rhythmPadActive = useEditorStore((s) => s.rhythmPadActive);

  useEffect(() => {
    initEngine();
  }, [initEngine]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        if (tapActive || rhythmPadActive) return;
        togglePlay();
      } else if (e.code === "KeyR" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        void toggleRecord();
      } else if (e.code === "KeyS" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        stop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, toggleRecord, stop, tapActive, rhythmPadActive]);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-6">
        <div className="mb-4">
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {title}
          </h1>
          {description && (
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>

        <TransportBar />
        <AppNav />

        <div className="mt-4">{children}</div>

        <footer className="mt-8 border-t border-border pt-4 text-center text-[11px] text-muted-foreground">
          Fuwari REC — 処理は端末内で完結。YouTubeは公式埋め込みのストリーミングのみ。
        </footer>
      </main>
    </div>
  );
}
