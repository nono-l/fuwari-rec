import { createFileRoute } from "@tanstack/react-router";
import { RemotePad } from "@/components/editor/remote-pad";
import { parseRemoteCode } from "@/lib/audio/remote-room";

export const Route = createFileRoute("/remote/$code")({
  component: RemoteCodePage,
  head: () => ({
    meta: [
      { title: "リモコン — Fuwari REC" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "theme-color", content: "#0f766e" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
    ],
  }),
});

function RemoteCodePage() {
  const { code: raw } = Route.useParams();
  const code = parseRemoteCode(raw ?? "");
  if (!code) {
    return (
      <div className="mx-auto max-w-md px-4 py-10 text-center">
        <h1 className="text-xl font-semibold text-foreground">リモコン</h1>
        <p className="mt-2 text-sm text-muted-foreground">コードが読めませんでした</p>
        <a href="/remote" className="mt-4 inline-block text-sm font-medium text-primary">
          コードを入力する
        </a>
      </div>
    );
  }
  return <RemotePad code={code} />;
}
