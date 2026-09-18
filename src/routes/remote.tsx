import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { parseRemoteCode } from "@/lib/audio/remote-room";

export const Route = createFileRoute("/remote")({
  validateSearch: (s: Record<string, unknown>) => ({
    c: typeof s.c === "string" ? s.c : typeof s.C === "string" ? s.C : "",
  }),
  component: RemotePage,
  head: () => ({
    meta: [
      { title: "リモコン — Fuwari REC" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "theme-color", content: "#0f766e" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
    ],
  }),
});

function RemotePage() {
  const { c } = Route.useSearch();
  const nav = useNavigate();
  const fromQuery = parseRemoteCode(c);
  const [typed, setTyped] = useState(fromQuery);

  const go = (raw: string) => {
    const code = parseRemoteCode(raw);
    if (!code) return;
    void nav({ to: "/remote/$code", params: { code } });
  };

  useEffect(() => {
    if (fromQuery) go(fromQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromQuery]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 py-10">
      <h1 className="text-2xl font-semibold text-foreground">リモコン</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        QR が開かないときは、パソコンに出ている5文字を入力してください。ログインは不要です。
      </p>
      <input
        value={typed}
        onChange={(e) => setTyped(parseRemoteCode(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter") go(typed);
        }}
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        inputMode="text"
        placeholder="例: 7K3MP"
        className="h-14 rounded-2xl border border-border bg-background px-4 text-center text-2xl font-semibold tracking-[0.35em] text-foreground uppercase"
      />
      <Button type="button" className="h-12" disabled={typed.length < 4} onClick={() => go(typed)}>
        開く
      </Button>
    </div>
  );
}
