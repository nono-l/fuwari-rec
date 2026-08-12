import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/editor/app-shell";
import { RemoteStorePanel } from "@/components/editor/remote-store-panel";

export const Route = createFileRoute("/cloud")({
  component: CloudPage,
  head: () => ({
    meta: [{ title: "リモート管理 — Fuwari REC" }],
  }),
});

function CloudPage() {
  return (
    <AppShell
      title="リモート管理"
      description="プロキシへの接続確認・IP の把握・設定のアップ／ダウンロード。サーバー setup.php とセットで使います。"
    >
      <RemoteStorePanel />
    </AppShell>
  );
}
