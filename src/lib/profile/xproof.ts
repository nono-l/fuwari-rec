import {
  XPROOF_CLIENT,
  XPROOF_ORIGIN,
  type XproofIdentity,
} from "./types";

const STATE_KEY = "fuwari-xproof-state";

export function xproofConnectUrl(returnTo: string, state: string) {
  const dest = new URL("/", XPROOF_ORIGIN);
  dest.searchParams.set("client", XPROOF_CLIENT);
  dest.searchParams.set("returnTo", returnTo);
  dest.searchParams.set("state", state);
  dest.searchParams.set("nickname", "Fuwari REC");
  return dest.toString();
}

export function newXproofState() {
  const state =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `xp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  try {
    sessionStorage.setItem(STATE_KEY, state);
  } catch {
    /* ignore */
  }
  return state;
}

export function readXproofState() {
  try {
    return sessionStorage.getItem(STATE_KEY);
  } catch {
    return null;
  }
}

export function clearXproofState() {
  try {
    sessionStorage.removeItem(STATE_KEY);
  } catch {
    /* ignore */
  }
}

export function parseYoutubeHandle(raw: string): string | null {
  const t = raw.trim().replace(/^@/, "");
  if (!t) return null;
  try {
    const u = new URL(t.startsWith("http") ? t : `https://www.youtube.com/@${t}`);
    if (!u.hostname.includes("youtube.com") && u.hostname !== "youtu.be") {
      return slugifyHandle(t);
    }
    const at = u.pathname.split("/").find((p) => p.startsWith("@"));
    if (at) return slugifyHandle(at.slice(1));
    const m = u.pathname.match(/\/channel\/([^/]+)/);
    if (m?.[1]) return m[1];
    return slugifyHandle(t);
  } catch {
    return slugifyHandle(t);
  }
}

export function slugifyHandle(raw: string) {
  return raw
    .trim()
    .replace(/^@/, "")
    .replace(/^https?:\/\//, "")
    .slice(0, 64);
}

export function mergeIdentities(
  current: XproofIdentity[],
  extra: XproofIdentity[],
): XproofIdentity[] {
  const out = [...current];
  for (const id of extra) {
    const username = slugifyHandle(id.username);
    if (!username) continue;
    const platform = id.platform;
    if (out.some((x) => x.platform === platform && x.username === username)) {
      continue;
    }
    out.push({ platform, username });
  }
  return out;
}

export function identitiesToFields(ids: XproofIdentity[]) {
  const x = ids.find((i) => i.platform === "x")?.username ?? "";
  const youtube = ids
    .filter((i) => i.platform === "youtube")
    .map((i) => i.username);
  return { xHandle: x, youtube };
}
