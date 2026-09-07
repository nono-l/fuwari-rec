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

export function publicCardPath(soulId: string) {
  return `/c/${encodeURIComponent(soulId)}`;
}

export function publicCardUrl(soulId: string, origin?: string) {
  const path = publicCardPath(soulId);
  if (origin) return `${origin}${path}`;
  return `https://fuwa.pachimanzi.uk${path}`;
}

export function sanitizeSoulId(raw: string) {
  try {
    raw = decodeURIComponent(raw);
  } catch {
    /* keep */
  }
  const s = raw.trim();
  if (!/^[A-Za-z0-9_\-=/?#]{3,64}$/.test(s)) return "";
  return s;
}

export function identitiesToFields(ids: XproofIdentity[]) {
  const x = ids.find((i) => i.platform === "x")?.username ?? "";
  const youtube = ids
    .filter((i) => i.platform === "youtube")
    .map((i) => i.username);
  return { xHandle: x, youtube };
}

export const XPROOF_CONNECT_SOURCE = "xproof-connect";

export type XproofGrantMessage = {
  source: typeof XPROOF_CONNECT_SOURCE;
  type: "granted";
  client?: string;
  token: string;
  state?: string;
  soulId?: string;
  identities?: XproofIdentity[];
};

export function parseXproofGrant(
  origin: string,
  data: unknown,
  expectedState: string | null,
): XproofGrantMessage | null {
  if (origin !== XPROOF_ORIGIN) return null;
  if (!data || typeof data !== "object") return null;
  const rec = data as Record<string, unknown>;
  if (rec.source !== XPROOF_CONNECT_SOURCE || rec.type !== "granted") return null;
  if (typeof rec.token !== "string" || !rec.token.trim()) return null;
  if (rec.state && expectedState && rec.state !== expectedState) return null;
  const identities: XproofIdentity[] = [];
  if (Array.isArray(rec.identities)) {
    for (const item of rec.identities) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const platform = String(row.platform ?? "");
      const username = slugifyHandle(String(row.username ?? ""));
      if (
        (platform === "x" || platform === "youtube" || platform === "dns") &&
        username
      ) {
        identities.push({ platform, username });
      }
    }
  }
  return {
    source: XPROOF_CONNECT_SOURCE,
    type: "granted",
    client: typeof rec.client === "string" ? rec.client : undefined,
    token: rec.token.trim(),
    state: typeof rec.state === "string" ? rec.state : undefined,
    soulId: typeof rec.soulId === "string" ? rec.soulId : undefined,
    identities,
  };
}
