import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth/client";
import {
  clearReturnTo,
  fetchAuthPublicConfig,
  isAllowedReturnTo,
  readReturnTo,
} from "@/lib/auth/handoff";
import { z } from "zod";

const searchSchema = z.object({
  returnTo: z.string().optional(),
});

/**
 * After OAuth on the canonical host (BETTER_AUTH_URL), mint a one-time token
 * and send the browser back to the custom domain to establish a local session.
 */
export const Route = createFileRoute("/auth/bridge")({
  validateSearch: (s) => searchSchema.parse(s),
  component: AuthBridge,
  head: () => ({ meta: [{ title: "サインイン完了…" }] }),
});

function AuthBridge() {
  const { returnTo: returnToQuery } = Route.useSearch();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await fetchAuthPublicConfig();
        const raw = returnToQuery || readReturnTo();
        if (!raw) {
          await navigate({ to: "/" });
          return;
        }
        const dest = isAllowedReturnTo(raw, cfg.handoffOrigins);
        if (!dest) {
          setError("戻り先のドメインが許可されていません");
          return;
        }

        if (dest.origin === window.location.origin) {
          clearReturnTo();
          window.location.href = dest.pathname + dest.search || "/";
          return;
        }

        const session = await authClient.getSession();
        if (!session.data?.session) {
          window.location.href = `/login?returnTo=${encodeURIComponent(raw)}`;
          return;
        }

        const { data, error: genErr } =
          await authClient.oneTimeToken.generate();
        if (genErr || !data?.token) {
          throw new Error(genErr?.message ?? "トークン生成に失敗しました");
        }
        if (cancelled) return;

        clearReturnTo();
        const accept = new URL("/auth/accept", dest.origin);
        accept.searchParams.set("token", data.token);
        const nextPath = dest.pathname && dest.pathname !== "/auth/accept"
          ? dest.pathname + dest.search
          : "/";
        if (nextPath !== "/") {
          accept.searchParams.set("next", nextPath);
        }
        window.location.href = accept.toString();
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "ハンドオフに失敗しました");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [returnToQuery, navigate]);

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4">
      <div className="max-w-sm text-center text-sm text-muted-foreground">
        {error ? (
          <>
            <p className="text-danger">{error}</p>
            <a href="/login" className="mt-3 inline-block text-primary underline">
              サインインに戻る
            </a>
          </>
        ) : (
          <p>サインインを完了しています…</p>
        )}
      </div>
    </main>
  );
}
