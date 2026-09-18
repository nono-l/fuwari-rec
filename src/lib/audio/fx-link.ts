import {
  fxSnapshotToXml,
  parseFxXml,
  type FxSnapshot,
} from "./fx-snapshot";

const PREFIX_Z = "z";
const PREFIX_R = "r";

function toB64url(bytes: Uint8Array) {
  let bin = "";
  const n = bytes.length;
  for (let i = 0; i < n; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromB64url(s: string) {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deflate(text: string) {
  const bytes = new TextEncoder().encode(text);
  if (typeof CompressionStream === "undefined") return null;
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(
      new CompressionStream("deflate-raw"),
    );
    const buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

async function inflate(bytes: Uint8Array) {
  if (typeof DecompressionStream === "undefined") return null;
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(
      new DecompressionStream("deflate-raw"),
    );
    return await new Response(stream).text();
  } catch {
    return null;
  }
}

export async function encodeFxPayload(snap: FxSnapshot) {
  const xml = fxSnapshotToXml(snap);
  const z = await deflate(xml);
  if (z && z.length < xml.length) return PREFIX_Z + toB64url(z);
  return PREFIX_R + toB64url(new TextEncoder().encode(xml));
}

export async function decodeFxPayload(raw: string): Promise<FxSnapshot[]> {
  const s = raw.trim();
  if (!s) throw new Error("リンクが空です");
  const kind = s[0];
  const body = s.slice(1);
  const bytes = fromB64url(body);
  let xml = "";
  if (kind === PREFIX_Z) {
    xml = (await inflate(bytes)) ?? "";
  } else if (kind === PREFIX_R) {
    xml = new TextDecoder().decode(bytes);
  } else {
    xml = decodeURIComponent(s);
  }
  if (!xml.trim()) throw new Error("リンクを展開できませんでした");
  return parseFxXml(xml);
}

export function fxLinkUrl(payload: string) {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  const path = "/effector";
  return `${origin}${path}#fx=${payload}`;
}

export function readFxLinkFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.replace(/^#/, "");
  if (hash.startsWith("fx=")) return hash.slice(3);
  const q = new URLSearchParams(window.location.search).get("fx");
  return q && q.trim() ? q.trim() : null;
}

export function clearFxLinkFromLocation() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("fx");
  url.hash = "";
  window.history.replaceState(null, "", url.pathname + url.search);
}

export function qrImageUrl(data: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&ecc=M&data=${encodeURIComponent(data)}`;
}
