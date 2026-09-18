import { createFileRoute } from "@tanstack/react-router";
import { RemotePad } from "@/components/editor/remote-pad";

export const Route = createFileRoute("/remote")({
  validateSearch: (s: Record<string, unknown>) => ({
    c: typeof s.c === "string" ? s.c : "",
  }),
  component: RemotePage,
  head: () => ({
    meta: [
      { title: "リモコン — Fuwari REC" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "theme-color", content: "#0f766e" },
    ],
  }),
});

function RemotePage() {
  const { c } = Route.useSearch();
  const code = c.trim().toUpperCase();
  if (!code) {
    return (
      <div className="mx-auto max-w-md px-4 py-10 text-center">
        <h1 className="text-xl font-semibold text-foreground">リモコン</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          PC のシーン欄で QR を出して、この端末で読み取ってください。
        </p>
      </div>
    );
  }
  return <RemotePad code={code} />;
}
