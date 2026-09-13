import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/editor/app-shell";
import { AdminPanel } from "@/components/editor/admin-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useIsAdmin } from "@/lib/admin/use-is-admin";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
  head: () => ({
    meta: [{ title: "管理 — Fuwari REC" }],
  }),
});

function AdminPage() {
  const { user, isPending } = useCurrentUserState();
  const { admin, ready } = useIsAdmin();

  if (isPending || !ready) {
    return (
      <AppShell title="管理" transport={false}>
        <div className="skeleton h-40 rounded-2xl" />
      </AppShell>
    );
  }

  if (!user) {
    return (
      <AppShell title="管理" transport={false}>
        <RedirectToSignIn />
      </AppShell>
    );
  }

  if (!admin) {
    return (
      <AppShell title="管理" transport={false}>
        <section className="rounded-2xl border border-border bg-card">
          <EmptyState
            icon={ShieldCheck}
            title="管理者ではありません"
            description="この画面はビルトイン管理者と、任命された人だけが使えます。"
            action={
              <Button asChild variant="secondary">
                <Link to="/">スタジオへ</Link>
              </Button>
            }
          />
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="管理"
      description="ビルトイン管理者と任命した人が、楽曲と公開ページを手入れします。"
      transport={false}
    >
      <AdminPanel />
    </AppShell>
  );
}
