import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/editor/app-shell";
import { VocalTrainPanel } from "@/components/editor/vocal-train-panel";

export const Route = createFileRoute("/train")({
  component: TrainPage,
  head: () => ({
    meta: [{ title: "ボイトレ — Fuwari REC" }],
  }),
});

function TrainPage() {
  return (
    <AppShell
      title="ボイトレ"
      description="指定された音に、2秒以内で声を返します。階段・同じ音・ランダム。"
    >
      <VocalTrainPanel />
    </AppShell>
  );
}
