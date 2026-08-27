import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/editor/app-shell";
import { DevicePanel } from "@/components/editor/device-panel";
import { EffectsPanel } from "@/components/editor/effects-panel";

export const Route = createFileRoute("/effector")({
  component: EffectorPage,
  head: () => ({
    meta: [{ title: "エフェクター — Fuwari REC" }],
  }),
});

function EffectorPage() {
  return (
    <AppShell
      title="エフェクター"
      description="録音なしでも使えるライブエフェクト。スペクトラム解析とフィルターでハウリングも消せます。"
    >
      <div className="space-y-4">
        <DevicePanel />
        <EffectsPanel layout="page" />
      </div>
    </AppShell>
  );
}
