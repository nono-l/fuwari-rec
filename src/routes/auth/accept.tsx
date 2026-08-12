import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth/client";
import { z } from "zod";

const searchSchema = z.object({
  token: z.string().optional(),
});

/**
 * Custom-domain side of the handoff: verify one-time token → local session cookie.
 */
export const Route = createFileRoute("/auth/accept")({
  validateSearch: (s) => searchSchema.parse(s),
  component: AuthAccept,
  head: () => ({ meta: [{ title: "サインイン中…" }] }),
});

function AuthAccept() {
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!token) {
          setError("トークンがありません");
          return;
        }
        const { error: vErr } = await authClient.oneTimeToken.verify({
          token,
        });
        if (vErr) {
          throw new Error(vErr.message ?? "トークンの検証に失敗しました");
        }
        if (cancelled) return;
        try {
          await authClient.getSession();
        } catch {
          /* ignore */
        }
        await navigate({ to: "/" });
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "サインインの引き継ぎに失敗しました",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, navigate]);

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4">
      <div className="max-w-sm text-center text-sm text-muted-foreground">
        {error ? (
          <>
            <p className="text-danger">{error}</p>
            <a href="/login" className="mt-3 inline-block text-primary underline">
              もう一度サインイン
            </a>
          </>
        ) : (
          <p>セッションを設定しています…</p>
        )}
      </div>
    </main>
  );
}
