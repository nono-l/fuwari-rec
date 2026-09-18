import { createFileRoute } from "@tanstack/react-router";
import { isSceneId, mintRemoteCode, type RemoteRoomState } from "@/lib/audio/remote-room";
import { BUILTIN_SCENES, type RemoteSceneBtn, type SceneId } from "@/lib/audio/scenes";
import { getSql } from "@/lib/db";

type Room = {
  code: string;
  scene: SceneId;
  hostAt: number;
  padAt: number;
  scenes: RemoteSceneBtn[];
};

const TTL_MS = 20 * 60 * 1000;

function roomsMem() {
  const g = globalThis as typeof globalThis & { __fuwariRemoteRooms__?: Map<string, Room> };
  if (!g.__fuwariRemoteRooms__) g.__fuwariRemoteRooms__ = new Map();
  return g.__fuwariRemoteRooms__;
}

function json(data: RemoteRoomState | { error: string }, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
}

function view(r: Room, now: number): RemoteRoomState {
  return {
    code: r.code,
    scene: r.scene,
    host: now - r.hostAt < 45000,
    pad: now - r.padAt < 20000,
    scenes: r.scenes.length ? r.scenes : BUILTIN_SCENES.map((s) => ({ id: s.id, label: s.label })),
  };
}

function parseScenes(raw: unknown): RemoteSceneBtn[] {
  if (!Array.isArray(raw)) return [];
  const out: RemoteSceneBtn[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const id = (item as { id?: unknown }).id;
    const label = (item as { label?: unknown }).label;
    if (!isSceneId(id) || typeof label !== "string") continue;
    const name = label.trim().slice(0, 24);
    if (!name) continue;
    out.push({ id, label: name });
    if (out.length >= 12) break;
  }
  return out;
}

async function ensureTable(sql: Awaited<ReturnType<typeof getSql>>) {
  await sql.query(
    `create table if not exists fuwari_remote_rooms (
      code text primary key,
      scene text not null default 'talk',
      host_at bigint not null,
      pad_at bigint not null default 0,
      scenes_json text not null default '[]'
    )`,
  );
  try {
    await sql.query(
      "alter table fuwari_remote_rooms add column scenes_json text not null default '[]'",
    );
  } catch {
    /* already there */
  }
}

async function readRoom(code: string): Promise<Room | null> {
  const mem = roomsMem().get(code);
  try {
    const sql = await getSql();
    await ensureTable(sql);
    const rows = await sql.query<{
      code: string;
      scene: string;
      host_at: number;
      pad_at: number;
      scenes_json?: string;
    }>(
      "select code, scene, host_at, pad_at, scenes_json from fuwari_remote_rooms where code = $1",
      [code],
    );
    const row = rows[0];
    if (!row) return mem ?? null;
    let scenes: RemoteSceneBtn[] = mem?.scenes ?? [];
    try {
      scenes = parseScenes(JSON.parse(row.scenes_json || "[]"));
    } catch {
      /* keep */
    }
    const room: Room = {
      code: row.code,
      scene: isSceneId(row.scene) ? row.scene : "talk",
      hostAt: Number(row.host_at) || 0,
      padAt: Number(row.pad_at) || 0,
      scenes,
    };
    roomsMem().set(code, room);
    return room;
  } catch {
    return mem ?? null;
  }
}

async function writeRoom(room: Room) {
  roomsMem().set(room.code, room);
  try {
    const sql = await getSql();
    await ensureTable(sql);
    await sql.query(
      `insert into fuwari_remote_rooms (code, scene, host_at, pad_at, scenes_json)
       values ($1, $2, $3, $4, $5)
       on conflict (code) do update set
         scene = excluded.scene,
         host_at = excluded.host_at,
         pad_at = excluded.pad_at,
         scenes_json = excluded.scenes_json`,
      [room.code, room.scene, room.hostAt, room.padAt, JSON.stringify(room.scenes)],
    );
  } catch {
    /* memory fallback */
  }
}

export const Route = createFileRoute("/api/remote-room")({
  server: {
    handlers: {
      OPTIONS: () =>
        new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "GET, POST, OPTIONS",
            "access-control-allow-headers": "content-type",
          },
        }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = String(url.searchParams.get("code") ?? "")
          .trim()
          .toUpperCase()
          .replace(/[^2-9A-Z]/g, "");
        if (code.length < 4) return json({ error: "コードが不正です" }, 400);
        const room = await readRoom(code);
        if (!room) return json({ error: "部屋がありません" }, 404);
        return json(view(room, Date.now()));
      },
      POST: async ({ request }) => {
        let body: { code?: string; role?: string; scene?: string; scenes?: unknown } = {};
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
          } while (await readRoom(code));
        }
        if (code.length < 4) return json({ error: "コードが不正です" }, 400);
        let room = await readRoom(code);
        if (room && now - Math.max(room.hostAt, room.padAt) > TTL_MS) {
          room = null;
        }
        if (!room) {
          if (role === "pad") return json({ error: "PC側が開いていません。パソコンでリモコンを出したままにしてください" }, 404);
          room = { code, scene: "talk", hostAt: now, padAt: 0, scenes: [] };
        }
        if (isSceneId(body.scene)) room.scene = body.scene;
        if (role === "host") {
          room.hostAt = now;
          const nextScenes = parseScenes(body.scenes);
          if (nextScenes.length) room.scenes = nextScenes;
        } else {
          room.padAt = now;
        }
        await writeRoom(room);
        return json(view(room, now));
      },
    },
  },
});
