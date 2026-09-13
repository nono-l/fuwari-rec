import { createFileRoute } from "@tanstack/react-router";
import { soundfontInfo } from "@/lib/audio/soundfont/catalog";
import { fetchSoundfontBytes } from "@/lib/audio/soundfont/fetch-server";

export const Route = createFileRoute("/api/soundfont/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const info = soundfontInfo(params.id);
        if (!info) {
          return Response.json({ error: "不明な SoundFont です" }, { status: 404 });
        }
        if (info.localOnly || info.urls.length === 0 || info.bytes > 40 * 1024 * 1024) {
          return Response.json(
            {
              error:
                "この音源はサイズが大きいためサーバー経由では渡せません。手元の .sf2 を指定してください",
            },
            { status: 413 },
          );
        }
        try {
          const bytes = await fetchSoundfontBytes(info);
          return new Response(Buffer.from(bytes), {
            status: 200,
            headers: {
              "content-type": "application/octet-stream",
              "content-length": String(bytes.byteLength),
              "cache-control":
                "public, max-age=86400, stale-while-revalidate=604800",
              "x-soundfont-id": info.id,
            },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "取得に失敗しました";
          return Response.json({ error: msg }, { status: 502 });
        }
      },
    },
  },
});
