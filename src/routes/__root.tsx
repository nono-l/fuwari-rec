import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { CreatedWithGrokBanner } from "@/components/created-with-grok-banner";
import { YoutubePlayerHost } from "@/components/editor/youtube-player-host";
import { AuthProvider } from "@/lib/auth/provider";

const APP_NAME = "Fuwari REC";
const APP_DESCRIPTION =
  "もっと手軽に歌える。録音・エフェクト・声域測定・YouTube伴奏・MIDI・リモート保存までブラウザ完結。";

const host = import.meta.env.VITE_PUBLIC_HOSTNAME as string | undefined;
const ogImage = host ? `https://${host}/og.jpg` : undefined;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      { name: "description", content: APP_DESCRIPTION },
      { name: "theme-color", content: "#0f766e" },
      // Open Graph
      { property: "og:type", content: "website" },
      { property: "og:title", content: APP_NAME },
      { property: "og:description", content: APP_DESCRIPTION },
      { property: "og:locale", content: "ja_JP" },
      ...(ogImage
        ? [
            { property: "og:image", content: ogImage },
            { property: "og:image:width", content: "1200" },
            { property: "og:image:height", content: "630" },
            { property: "og:image:type", content: "image/jpeg" },
            { name: "twitter:card", content: "summary_large_image" },
            { name: "twitter:title", content: APP_NAME },
            { name: "twitter:description", content: APP_DESCRIPTION },
            { name: "twitter:image", content: ogImage },
          ]
        : [{ name: "twitter:card", content: "summary" }]),
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <html lang="ja">
      <head>
        <HeadContent />
      </head>
      <body>
        <AuthProvider>
          <Outlet />
          <YoutubePlayerHost />
          <CreatedWithGrokBanner />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  );
}
