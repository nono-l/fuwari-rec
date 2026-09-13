import { gunzipSync } from "node:zlib";
import type { SoundfontInfo } from "./catalog";

const UA = "Mozilla/5.0 (compatible; FuwariREC/1.0; +https://fuwa.pachimanzi.uk)";

function isSf2(buf: Uint8Array) {
  if (buf.byteLength < 12) return false;
  return (
    String.fromCharCode(buf[0]!, buf[1]!, buf[2]!, buf[3]!) === "RIFF"
  );
}

/** Pull the first .sf2 out of a tar (ustar) archive. */
function sf2FromTar(tar: Uint8Array): Uint8Array | null {
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;
    const name = decoder(header.subarray(0, 100));
    const sizeStr = decoder(header.subarray(124, 136)).replace(/\0/g, "").trim();
    const size = Number.parseInt(sizeStr, 8) || 0;
    const dataStart = offset + 512;
    const dataEnd = dataStart + size;
    if (dataEnd > tar.length) break;
    if (/\.sf2$/i.test(name)) {
      return tar.subarray(dataStart, dataEnd);
    }
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  return null;
}

function decoder(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i]!;
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

export async function fetchSoundfontBytes(info: SoundfontInfo): Promise<Uint8Array> {
  let last = "取得できませんでした";
  for (const url of info.urls) {
    try {
      const up = await fetch(url, {
        redirect: "follow",
        headers: { Accept: "*/*", "User-Agent": UA },
      });
      if (!up.ok) {
        last = `${url} → HTTP ${up.status}`;
        continue;
      }
      const raw = new Uint8Array(await up.arrayBuffer());
      if (info.unpack === "targz-sf2") {
        const tar = gunzipSync(raw);
        const sf2 = sf2FromTar(tar);
        if (!sf2 || !isSf2(sf2)) {
          last = `${url} → tar 内に SF2 がありません`;
          continue;
        }
        return sf2;
      }
      if (!isSf2(raw)) {
        last = `${url} → SoundFont ではありません`;
        continue;
      }
      return raw;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(last);
}
