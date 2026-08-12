import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth/client";
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
  const { returnTo } = Route.useSearch();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!returnTo) {
          await navigate({ to: "/" });
          return;
        }
        let dest: URL;
        try {
          dest = new URL(returnTo);
        } catch {
          setError("returnTo が不正です");
          return;
        }
        // Only hand off to https origins that look like our app domains
        if (dest.protocol !== "https:" && dest.protocol !== "http:") {
          setError("不正な戻り先です");
          return;
        }

        const session = await authClient.getSession();
        if (!session.data?.session) {
          // Not signed in on this host — send to login again
          window.location.href = `/login?returnTo=${encodeURIComponent(returnTo)}`;
          return;
        }

        const { data, error: genErr } =
          await authClient.oneTimeToken.generate();
        if (genErr || !data?.token) {
          throw new Error(genErr?.message ?? "トークン生成に失敗しました");
        }
        if (cancelled) return;

        const accept = new URL("/auth/accept", dest.origin);
        accept.searchParams.set("token", data.token);
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
  }, [returnTo, navigate]);

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
