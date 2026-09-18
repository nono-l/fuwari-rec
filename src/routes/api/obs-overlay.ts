import { createFileRoute } from "@tanstack/react-router";
import type { ObsOverlayFrame } from "@/lib/audio/obs-overlay-bus";

type Slot = { frame: ObsOverlayFrame; at: number };

function slot() {
  const g = globalThis as typeof globalThis & { __fuwariObsOverlay__?: Slot };
  return g;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export const Route = createFileRoute("/api/obs-overlay")({
  server: {
    handlers: {
      GET: () => {
        const s = slot().__fuwariObsOverlay__;
        if (!s || Date.now() - s.at > 2500) {
          return json({ scene: "", live: false, bars: [], caption: "", captionInterim: "" });
        }
        return json(s.frame);
      },
      POST: async ({ request }) => {
        let body: ObsOverlayFrame;
        try {
          body = (await request.json()) as ObsOverlayFrame;
        } catch {
          return json({ error: "JSON が読めません" }, 400);
        }
        const bars = Array.isArray(body.bars)
          ? body.bars.slice(0, 64).map((n) => Math.max(0, Math.min(1, Number(n) || 0)))
          : [];
        slot().__fuwariObsOverlay__ = {
          at: Date.now(),
          frame: {
            scene: String(body.scene ?? ""),
            live: Boolean(body.live),
            bars,
            caption: String(body.caption ?? "").slice(0, 120),
            captionInterim: String(body.captionInterim ?? "").slice(0, 80),
          },
        };
        return json({ ok: true });
      },
    },
  },
});
