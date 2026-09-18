import { createFileRoute } from "@tanstack/react-router";
import { isSceneId, mintRemoteCode, type RemoteRoomState } from "@/lib/audio/remote-room";
import type { SceneId } from "@/lib/audio/scenes";

type Room = {
  code: string;
  scene: SceneId;
  hostAt: number;
  padAt: number;
};

const TTL_MS = 20 * 60 * 1000;

function rooms() {
  const g = globalThis as typeof globalThis & { __fuwariRemoteRooms__?: Map<string, Room> };
  if (!g.__fuwariRemoteRooms__) g.__fuwariRemoteRooms__ = new Map();
  return g.__fuwariRemoteRooms__;
}

function sweep(map: Map<string, Room>) {
  const now = Date.now();
  for (const [k, r] of map) {
    if (now - Math.max(r.hostAt, r.padAt) > TTL_MS) map.delete(k);
  }
}

function json(data: RemoteRoomState | { error: string }, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function view(r: Room, now: number): RemoteRoomState {
  return {
    code: r.code,
    scene: r.scene,
    host: now - r.hostAt < 4000,
    pad: now - r.padAt < 8000,
  };
}

export const Route = createFileRoute("/api/remote-room")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const map = rooms();
        sweep(map);
        let body: { code?: string; role?: string; scene?: string } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return json({ error: "JSON が読めません" }, 400);
        }
        const role = body.role === "pad" ? "pad" : "host";
        const now = Date.now();
        let code = String(body.code ?? "")
          .trim()
          .toUpperCase()
          .replace(/[^2-9A-Z]/g, "");
        if (role === "host" && !code) {
          do {
            code = mintRemoteCode();
          } while (map.has(code));
        }
        if (code.length < 4) return json({ error: "コードが不正です" }, 400);
        let room = map.get(code);
        if (!room) {
          if (role === "pad") return json({ error: "PC側が開いていません" }, 404);
          room = { code, scene: "talk", hostAt: now, padAt: 0 };
          map.set(code, room);
        }
        if (isSceneId(body.scene)) room.scene = body.scene;
        if (role === "host") room.hostAt = now;
        else room.padAt = now;
        return json(view(room, now));
      },
    },
  },
});
