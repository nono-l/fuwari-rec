import type { SceneId } from "./scenes";
import { SCENES } from "./scenes";

export function isSceneId(v: unknown): v is SceneId {
  return SCENES.some((s) => s.id === v);
}

export type RemoteRoomState = {
  code: string;
  scene: SceneId;
  pad: boolean;
  host: boolean;
};

export function mintRemoteCode() {
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  let s = "";
  const buf = new Uint8Array(5);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(buf);
  } else {
    for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256);
  }
  for (const b of buf) s += alphabet[b % alphabet.length];
  return s;
}

export function remotePageUrl(code: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/remote?c=${encodeURIComponent(code)}`;
}

export async function postRemoteRoom(body: {
  code?: string;
  role: "host" | "pad";
  scene?: SceneId;
}): Promise<RemoteRoomState> {
  const res = await fetch("/api/remote-room", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as RemoteRoomState & { error?: string };
  if (!res.ok) throw new Error(data.error || "リモコンに繋がっていません");
  return data;
}
