import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/editor/app-shell";
import { MediaRangePanel } from "@/components/editor/media-range-panel";

export const Route = createFileRoute("/analyze")({
  component: AnalyzePage,
  head: () => ({
    meta: [{ title: "音源解析 — Fuwari REC" }],
  }),
});

function AnalyzePage() {
  return (
    <AppShell
      title="音源解析"
      description="読み込んだ曲・動画の声域レンジを解析します。マイク測定とは別タブです。"
    >
      <MediaRangePanel />
    </AppShell>
  );
}
