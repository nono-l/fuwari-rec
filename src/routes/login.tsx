import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Mic2 } from "lucide-react";
import {
  GROK_PROVIDERS,
  authClient,
  authEnabled,
  signIn,
} from "@/lib/auth/client";
import {
  bridgeCallbackURL,
  fetchAuthPublicConfig,
  rememberReturnTo,
} from "@/lib/auth/handoff";
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
  const [canonical, setCanonical] = useState<string | null | undefined>(
    undefined,
  );
  const started = useRef(false);

  useEffect(() => {
    void fetchAuthPublicConfig().then((cfg) =>
      setCanonical(cfg.canonicalOrigin),
    );
  }, []);

  useEffect(() => {
    if (returnTo) rememberReturnTo(returnTo);
  }, [returnTo]);

  const handleSignIn = async (providerId: string) => {
    setError(null);
    setBusy(providerId);
    try {
      if (returnTo) rememberReturnTo(returnTo);

      // Already signed in on the auth host — just hand the session back.
      if (returnTo) {
        try {
          const existing = await authClient.getSession();
          if (existing.data?.session) {
            window.location.href = bridgeCallbackURL(returnTo);
            return;
          }
        } catch {
          /* start a fresh sign-in */
        }
      }

      const callbackURL = returnTo ? bridgeCallbackURL(returnTo) : "/";
      await signIn(providerId, {
        callbackURL,
        errorCallbackURL: returnTo
          ? `/login?returnTo=${encodeURIComponent(returnTo)}`
          : "/login",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "サインインに失敗しました");
      setBusy(null);
    }
  };

  // Auto-start only after we know canonical (null = none, string = host).
  // Starting earlier used callbackURL "/" and never returned to the custom domain.
  useEffect(() => {
    if (canonical === undefined) return;
    if (!authEnabled || !provider) return;
    if (!GROK_PROVIDERS.some((p) => p.providerId === provider)) return;
    if (started.current) return;
    started.current = true;
    void handleSignIn(provider);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, canonical]);

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
            {canonical.replace(/^https?:\/\//, "")}
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
