import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";

export type SongListenLink = {
  id: string;
  songId: string;
  url: string;
  service: string;
  createdBy: string;
  createdAt: string | null;
};

const SERVICE_HOSTS: { match: string; label: string }[] = [
  { match: "open.spotify.com", label: "Spotify" },
  { match: "spotify.com", label: "Spotify" },
  { match: "music.apple.com", label: "Apple Music" },
  { match: "itunes.apple.com", label: "Apple Music" },
  { match: "music.youtube.com", label: "YouTube Music" },
  { match: "youtu.be", label: "YouTube" },
  { match: "youtube.com", label: "YouTube" },
  { match: "music.amazon.", label: "Amazon Music" },
  { match: "amazon.co.jp", label: "Amazon Music" },
  { match: "amazon.com", label: "Amazon Music" },
  { match: "music.line.me", label: "LINE MUSIC" },
  { match: "line.me", label: "LINE MUSIC" },
  { match: "recochoku.jp", label: "レコチョク" },
  { match: "mora.jp", label: "mora" },
  { match: "linkco.re", label: "mora" },
  { match: "awa.fm", label: "AWA" },
  { match: "kkbox.com", label: "KKBOX" },
  { match: "tidal.com", label: "TIDAL" },
  { match: "deezer.com", label: "Deezer" },
  { match: "soundcloud.com", label: "SoundCloud" },
  { match: "bandcamp.com", label: "Bandcamp" },
  { match: "nicovideo.jp", label: "ニコニコ動画" },
  { match: "nico.ms", label: "ニコニコ動画" },
  { match: "music.apple.", label: "Apple Music" },
];

export function serviceLabel(host: string) {
  const h = host.toLowerCase().replace(/^www\./, "");
  const hit = SERVICE_HOSTS.find(
    (s) => h === s.match || h.endsWith(`.${s.match}`) || h.includes(s.match),
  );
  return hit?.label ?? h;
}

export function parseListenUrl(raw: string): { url: string; service: string } {
  const t = String(raw ?? "").trim();
  if (!t) throw new Error("URLを入れてください");
  let u: URL;
  try {
    u = new URL(t);
  } catch {
    throw new Error("URLの形を確認してください");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new Error("http(s) のURLだけ追加できます");
  }
  if (u.username || u.password) throw new Error("そのURLは使えません");
  if (u.hostname === "localhost" || u.hostname.endsWith(".local")) {
    throw new Error("そのURLは使えません");
  }
  u.hash = "";
  const url = u.toString().slice(0, 500);
  return { url, service: serviceLabel(u.hostname) };
}

function asIso(v: string | Date | null | undefined) {
  if (!v) return null;
  return typeof v === "string" ? v : v.toISOString();
}

export const listSongLinks = createServerFn({ method: "GET" })
  .validator((songId: unknown) => String(songId ?? "").trim().slice(0, 40))
  .handler(async ({ data: songId }): Promise<SongListenLink[]> => {
    if (!songId) return [];
    try {
      const { getSql } = await import("@/lib/db");
      const sql = await getSql();
      const rows = await sql<{
        id: string;
        song_id: string;
        url: string;
        service: string;
        created_by: string;
        created_at: string | Date | null;
      }>`
        select id, song_id, url, service, created_by, created_at
        from fuwari_song_links
        where song_id = ${songId}
        order by created_at asc
        limit 40
      `;
      return rows.map((r) => ({
        id: r.id,
        songId: r.song_id,
        url: r.url,
        service: r.service || serviceLabel(new URL(r.url).hostname),
        createdBy: r.created_by,
        createdAt: asIso(r.created_at),
      }));
    } catch {
      return [];
    }
  });

export const addSongLink = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((raw: unknown) => {
    const o = (raw ?? {}) as { songId?: string; url?: string };
    return {
      songId: String(o.songId ?? "").trim().slice(0, 40),
      url: String(o.url ?? "").trim().slice(0, 500),
    };
  })
  .handler(async ({ context, data }) => {
    if (!data.songId) throw new Error("曲が指定されていません");
    const parsed = parseListenUrl(data.url);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const song = await sql<{ id: string }>`
      select id from fuwari_songs where id = ${data.songId} limit 1
    `;
    if (!song[0]) throw new Error("曲が見つかりません");
    const n = await sql<{ n: number }>`
      select count(*)::int as n from fuwari_song_links where song_id = ${data.songId}
    `;
    if ((n[0]?.n ?? 0) >= 40) throw new Error("この曲のリンクは上限です");
    const id = `l_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    try {
      await sql`
        insert into fuwari_song_links (id, song_id, url, service, created_by, created_at)
        values (${id}, ${data.songId}, ${parsed.url}, ${parsed.service}, ${context.userId}, now())
      `;
    } catch {
      throw new Error("同じURLはすでに入っています");
    }
    return { ok: true as const, id };
  });

export const deleteSongLink = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: unknown) => String(id ?? "").trim().slice(0, 40))
  .handler(async ({ context, data: id }) => {
    if (!id) throw new Error("リンクが指定されていません");
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{ created_by: string }>`
      select created_by from fuwari_song_links where id = ${id} limit 1
    `;
    const row = rows[0];
    if (!row) return { ok: true as const };
    const { isAdminUser } = await import("@/lib/admin/server");
    const admin = await isAdminUser(context.userId);
    if (!admin && row.created_by && row.created_by !== context.userId) {
      throw new Error("自分が追加したリンクだけ消せます");
    }
    if (admin) {
      await sql`delete from fuwari_song_links where id = ${id}`;
    } else {
      await sql`
        delete from fuwari_song_links where id = ${id} and created_by = ${context.userId}
      `;
    }
    return { ok: true as const };
  });
