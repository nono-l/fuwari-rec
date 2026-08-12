import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Mic2 } from "lucide-react";
import {
  GROK_PROVIDERS,
  authEnabled,
  fetchCanonicalAuthOrigin,
  signIn,
} from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { z } from "zod";

const searchSchema = z.object({
  returnTo: z.string().optional(),
  provider: z.string().optional(),
  error: z.string().optional(),
});

export const Route = createFileRoute("/login")({
  validateSearch: (s) => searchSchema.parse(s),
  component: Login,
});

function Login() {
  const { returnTo, provider, error: urlError } = Route.useSearch();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(urlError ?? null);
  const [canonical, setCanonical] = useState<string | null>(null);

  useEffect(() => {
    void fetchCanonicalAuthOrigin().then(setCanonical);
  }, []);

  // Auto-start provider when bounced here from a custom domain with ?provider=
  useEffect(() => {
    if (!authEnabled || !provider) return;
    if (!GROK_PROVIDERS.some((p) => p.providerId === provider)) return;
    void handleSignIn(provider);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  const handleSignIn = async (providerId: string) => {
    setError(null);
    setBusy(providerId);
    try {
      // When on canonical host with returnTo (from custom domain), complete OAuth
      // then bridge back. Otherwise normal home callback.
      const callbackURL =
        returnTo &&
        typeof window !== "undefined" &&
        canonical &&
        window.location.origin === canonical
          ? `/auth/bridge?returnTo=${encodeURIComponent(returnTo)}`
          : "/";
      await signIn(providerId, {
        callbackURL,
        errorCallbackURL: "/login",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "サインインに失敗しました");
      setBusy(null);
    }
  };

  const onCustomDomain =
    typeof window !== "undefined" &&
    canonical &&
    window.location.origin !== canonical;

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 pt-[var(--grok-banner-h,0px)]">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground">
            <Mic2 className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              Fuwari REC
            </h1>
            <p className="text-xs text-muted-foreground">
              アカウントでサインイン
            </p>
          </div>
        </div>

        {onCustomDomain && (
          <p className="mb-3 rounded-xl border border-border bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            カスタムドメインからのサインインは、認証ホスト（
            {canonical?.replace(/^https?:\/\//, "")}
            ）経由で行い、完了後にこちらへ戻します。
          </p>
        )}

        {error && (
          <p className="mb-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </p>
        )}

        {authEnabled ? (
          <div className="space-y-2">
            {GROK_PROVIDERS.map((p) => (
              <Button
                key={p.providerId}
                type="button"
                variant="secondary"
                className="w-full justify-center"
                disabled={busy !== null}
                onClick={() => void handleSignIn(p.providerId)}
              >
                {busy === p.providerId
                  ? "リダイレクト中…"
                  : `${p.label} で続ける`}
              </Button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            サインインは現在無効です。
          </p>
        )}

        <Button asChild variant="ghost" className="mt-4 w-full">
          <Link to="/">スタジオに戻る</Link>
        </Button>
      </div>
    </main>
  );
}
