import { Link } from "@tanstack/react-router";
import { Mic2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SignedIn, SignedOut, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useIsAdmin } from "@/lib/admin/use-is-admin";
import { APP_BUILD_AT } from "@/lib/build-info";

export function AppHeader() {
  const { user, isPending } = useCurrentUserState();
  const { admin } = useIsAdmin();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 pt-[var(--grok-banner-h,0px)] backdrop-blur-md">
      <div className="mx-auto flex min-h-14 max-w-7xl items-center justify-between gap-3 px-4 py-1.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm">
            <Mic2 className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold tracking-tight text-foreground">
              Fuwari REC
            </div>
            <div className="flex flex-wrap items-baseline gap-x-1.5 text-[11px] leading-snug text-muted-foreground">
              <span className="whitespace-nowrap">ブラウザでふわふわ歌う</span>
              <span
                className="whitespace-nowrap tabular-nums text-muted-foreground/90"
                title={`ビルド ${APP_BUILD_AT}（JST）`}
              >
                <span aria-hidden className="mr-1 text-muted-foreground/50">
                  ·
                </span>
                ビルド {APP_BUILD_AT}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isPending ? (
            <div className="skeleton size-8 rounded-full" />
          ) : user ? (
            <SignedIn>
              {admin && (
                <Button asChild size="sm" variant="ghost">
                  <Link to="/admin">管理</Link>
                </Button>
              )}
              <Button asChild size="sm" variant="ghost">
                <Link to="/profile">プロフィール</Link>
              </Button>
              <UserButton />
            </SignedIn>
          ) : (
            <SignedOut>
              <Button asChild size="sm" variant="secondary">
                <Link to="/login">サインイン</Link>
              </Button>
            </SignedOut>
          )}
        </div>
      </div>
    </header>
  );
}
