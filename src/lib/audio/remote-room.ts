import type { RemoteSceneBtn, SceneId } from "./scenes";

export function isSceneId(v: unknown): v is SceneId {
  return typeof v === "string" && /^[a-zA-Z0-9_-]{1,48}$/.test(v);
}

export type RemoteRoomState = {
  code: string;
  scene: SceneId;
  pad: boolean;
  host: boolean;
  scenes: RemoteSceneBtn[];
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
  return `${origin}/remote/${encodeURIComponent(code.toUpperCase())}`;
}

export function parseRemoteCode(raw: string) {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^2-9A-Z]/g, "")
    .slice(0, 8);
}

export async function postRemoteRoom(body: {
  code?: string;
  role: "host" | "pad";
  scene?: SceneId;
  scenes?: RemoteSceneBtn[];
}): Promise<RemoteRoomState> {
  const res = await fetch("/api/remote-room", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  let data: (RemoteRoomState & { error?: string }) | null = null;
  try {
    data = JSON.parse(text) as RemoteRoomState & { error?: string };
  } catch {
    throw new Error(
      res.ok ? "応答が読めません" : `接続できません（${res.status}）`,
    );
  }
  if (!res.ok) throw new Error(data.error || "リモコンに繋がっていません");
  return data;
}
