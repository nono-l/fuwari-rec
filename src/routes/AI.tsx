import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/editor/app-shell";
import { AiRuntimePanel } from "@/components/editor/ai-runtime-panel";

export const Route = createFileRoute("/AI")({
  component: AiPage,
  head: () => ({
    meta: [{ title: "AI土台 — Fuwari REC" }],
  }),
});

function AiPage() {
  return (
    <AppShell
      title="AI土台"
      description="誰の声でもない公式モデル。変換に使えるのは .onnx だけです。.pt / .pth は学習用で、選んでも素通りになります。"
    >
      <AiRuntimePanel />
    </AppShell>
  );
}
