import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/editor/app-shell";
import { RangePanel } from "@/components/editor/range-panel";

export const Route = createFileRoute("/range")({
  component: RangePage,
  head: () => ({
    meta: [{ title: "声域測定 — Fuwari REC" }],
  }),
});

function RangePage() {
  return (
    <AppShell
      title="声域測定"
      description="マイクで、安定して出せる低音〜高音を測ります。曲の解析は「音源解析」タブへ。"
    >
      <RangePanel />
    </AppShell>
  );
}
