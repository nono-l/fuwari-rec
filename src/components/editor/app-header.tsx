import { Link } from "@tanstack/react-router";
import { Mic2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SignedIn, SignedOut, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export function AppHeader() {
  const { user, isPending } = useCurrentUserState();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 pt-[var(--grok-banner-h,0px)] backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm">
            <Mic2 className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold tracking-tight text-foreground">
              Fuwari REC
            </div>
            <div className="truncate text-[11px] text-muted-foreground">
              ブラウザでふわふわ歌う
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isPending ? (
            <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
          ) : user ? (
            <SignedIn>
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
