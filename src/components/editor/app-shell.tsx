import { useEffect, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AppHeader } from "@/components/editor/app-header";
import { AppNav } from "@/components/editor/app-nav";
import { TransportBar } from "@/components/editor/transport-bar";
import { useEditorStore } from "@/lib/store/editor-store";
import { useAiRuntimeStore } from "@/lib/store/ai-runtime-store";
import { sceneByKey } from "@/lib/audio/scenes";
import { FxLinkBoot } from "@/components/editor/fx-link-boot";
import { ObsOverlayPublish } from "@/components/editor/obs-overlay-publish";
import { SceneCloudBoot } from "@/components/editor/scene-cloud-boot";

export function AppShell({
  title,
  description,
  children,
  transport = true,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  transport?: boolean;
}) {
  const initEngine = useEditorStore((s) => s.initEngine);
  const hydrateAi = useAiRuntimeStore((s) => s.hydrate);
  const togglePlay = useEditorStore((s) => s.togglePlay);
  const toggleRecord = useEditorStore((s) => s.toggleRecord);
  const stop = useEditorStore((s) => s.stop);
  const tapActive = useEditorStore((s) => s.tapActive);
  const undoMidiEdit = useEditorStore((s) => s.undoMidiEdit);
  const recallScene = useEditorStore((s) => s.recallScene);
  const sceneList = useEditorStore((s) => s.sceneList);

  useEffect(() => {
    initEngine();
    void hydrateAi();
  }, [initEngine, hydrateAi]);

  useEffect(() => {
    if (!transport) return;
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
        if (tapActive) return;
        togglePlay();
      } else if (
        (e.ctrlKey || e.metaKey) &&
        e.code === "KeyZ" &&
        !e.shiftKey
      ) {
        e.preventDefault();
        undoMidiEdit();
      } else if (e.code === "KeyR" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        void toggleRecord();
      } else if (e.code === "KeyS" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        stop();
      } else if (!e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        const scene = sceneByKey(e.code, sceneList);
        if (scene) {
          e.preventDefault();
          recallScene(scene);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [transport, togglePlay, toggleRecord, stop, tapActive, undoMidiEdit, recallScene, sceneList]);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <FxLinkBoot />
      <ObsOverlayPublish />
      <SceneCloudBoot />
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-6">
        <div className="mb-4 animate-page-enter">
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {title}
          </h1>
          {description && (
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>

        {transport && <TransportBar />}
        <AppNav />

        <div className="mt-4 animate-page-enter">{children}</div>

        <footer className="mt-8 border-t border-border pt-4 text-center text-[11px] text-muted-foreground">
          Fuwari REC — 処理は端末内で完結。YouTubeは公式埋め込みのストリーミングのみ。
          {" · "}
          <Link
            to="/terms"
            className="underline decoration-border underline-offset-2 hover:text-foreground"
          >
            配信規約 / ビデオポリシー
          </Link>
        </footer>
      </main>
    </div>
  );
}
