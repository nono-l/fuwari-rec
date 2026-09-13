import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import type { SingableSong, SingableSinger } from "./types";

function asIso(v: string | Date | null | undefined) {
  if (!v) return null;
  return typeof v === "string" ? v : v.toISOString();
}

function clip(raw: unknown, n: number) {
  return String(raw ?? "").trim().slice(0, n);
}

function pageOpts(raw: unknown) {
  const o = (raw ?? {}) as { q?: string; page?: number; pageSize?: number };
  return {
    q: clip(o.q, 80),
    page: Math.max(1, Math.floor(Number(o.page) || 1)),
    pageSize: Math.min(50, Math.max(5, Math.floor(Number(o.pageSize) || 20))),
  };
}

export type SingablePage = {
  songs: SingableSong[];
  total: number;
  page: number;
  pageSize: number;
};

type SingableRow = {
  id: string;
  title: string;
  artist: string;
  mgmt_no: string;
  genre: string;
  key_note: string;
  vocal_min_note?: string;
  vocal_max_note?: string;
  bpm?: number;
  created_at: string | Date | null;
  source?: string;
  added_by_name?: string;
};

function mapSingable(rows: SingableRow[], withActor = false): SingableSong[] {
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    artist: r.artist,
    mgmtNo: r.mgmt_no ?? "",
    genre: r.genre ?? "",
    keyNote: r.key_note ?? "",
    vocalMinNote: r.vocal_min_note ?? "",
    vocalMaxNote: r.vocal_max_note ?? "",
    bpm: Number(r.bpm) > 0 ? Math.round(Number(r.bpm)) : 0,
    markedAt: asIso(r.created_at),
    source: r.source === "proxy" ? "proxy" : "self",
    addedByName:
      withActor && r.source === "proxy" ? r.added_by_name || "" : undefined,
  }));
}

export async function loadSingableForUser(
  userId: string,
  opts: { q?: string; page?: number; pageSize?: number; withActor?: boolean } = {},
): Promise<SingablePage> {
  const q = clip(opts.q, 80);
  const page = Math.max(1, Math.floor(Number(opts.page) || 1));
  const pageSize = Math.min(50, Math.max(5, Math.floor(Number(opts.pageSize) || 20)));
  const withActor = Boolean(opts.withActor);
  const empty: SingablePage = { songs: [], total: 0, page, pageSize };
  if (!userId) return empty;
  try {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const needle = q ? `%${q}%` : "";
    const offset = (page - 1) * pageSize;
    const countRows = needle
      ? await sql<{ n: number }>`
          select count(*)::int as n
          from fuwari_singable m
          join fuwari_songs s on s.id = m.song_id
          where m.user_id = ${userId}
            and (
              s.title ilike ${needle} or s.artist ilike ${needle}
              or s.mgmt_no ilike ${needle} or s.title_kana ilike ${needle}
            )
        `
      : await sql<{ n: number }>`
          select count(*)::int as n from fuwari_singable where user_id = ${userId}
        `;
    const total = Number(countRows[0]?.n) || 0;
    const rows = needle
      ? await sql<SingableRow>`
          select s.id, s.title, s.artist, s.mgmt_no, s.genre, s.key_note,
                 s.vocal_min_note, s.vocal_max_note, s.bpm,
                 m.created_at, m.source,
                 coalesce(op.display_name, op.soul_id, '') as added_by_name
          from fuwari_singable m
          join fuwari_songs s on s.id = m.song_id
          left join fuwari_profiles op on op.user_id = m.added_by
          where m.user_id = ${userId}
            and (
              s.title ilike ${needle} or s.artist ilike ${needle}
              or s.mgmt_no ilike ${needle} or s.title_kana ilike ${needle}
            )
          order by m.created_at desc
          limit ${pageSize} offset ${offset}
        `
      : await sql<SingableRow>`
          select s.id, s.title, s.artist, s.mgmt_no, s.genre, s.key_note,
                 s.vocal_min_note, s.vocal_max_note, s.bpm,
                 m.created_at, m.source,
                 coalesce(op.display_name, op.soul_id, '') as added_by_name
          from fuwari_singable m
          join fuwari_songs s on s.id = m.song_id
          left join fuwari_profiles op on op.user_id = m.added_by
          where m.user_id = ${userId}
          order by m.created_at desc
          limit ${pageSize} offset ${offset}
        `;
    return { songs: mapSingable(rows, withActor), total, page, pageSize };
  } catch {
    return empty;
  }
}

export const listMySingable = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((raw: unknown) => pageOpts(raw))
  .handler(async ({ context, data }) =>
    loadSingableForUser(context.userId, { ...data, withActor: true }),
  );

export const listPublicSingable = createServerFn({ method: "GET" })
  .validator((raw: unknown) => {
    const o = (raw ?? {}) as { soulId?: string };
    return { soulId: clip(o.soulId, 64), ...pageOpts(raw) };
  })
  .handler(async ({ data }) => {
    if (!data.soulId) {
      return { songs: [] as SingableSong[], total: 0, page: 1, pageSize: data.pageSize };
    }
    try {
      const { getSql } = await import("@/lib/db");
      const sql = await getSql();
      const rows = await sql<{ user_id: string }>`
        select user_id from fuwari_profiles
        where soul_id = ${data.soulId} and is_public = true and xproof_linked = true
        limit 1
      `;
      const userId = rows[0]?.user_id;
      if (!userId) {
        return { songs: [], total: 0, page: 1, pageSize: data.pageSize };
      }
      return loadSingableForUser(userId, data);
    } catch {
      return { songs: [], total: 0, page: 1, pageSize: data.pageSize };
    }
  });

export const whichSingable = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((ids: unknown) => {
    const arr = Array.isArray(ids) ? ids : [];
    return arr
      .map((id) => String(id ?? "").trim().slice(0, 40))
      .filter(Boolean)
      .slice(0, 50);
  })
  .handler(async ({ context, data: ids }) => {
    if (!ids.length) return [] as string[];
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const params: unknown[] = [context.userId, ...ids];
    const placeholders = ids.map((_, i) => `$${i + 2}`).join(", ");
    const rows = await sql.query<{ song_id: string }>(
      `select song_id from fuwari_singable
       where user_id = $1 and song_id in (${placeholders})`,
      params,
    );
    return rows.map((r) => r.song_id);
  });

export const markSingable = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((songId: unknown) => String(songId ?? "").trim().slice(0, 40))
  .handler(async ({ context, data: songId }) => {
    if (!songId) throw new Error("曲が指定されていません");
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const found = await sql<{ id: string }>`
      select id from fuwari_songs where id = ${songId} limit 1
    `;
    if (!found[0]) throw new Error("曲が見つかりません");
    await sql`
      insert into fuwari_singable (user_id, song_id, created_at)
      values (${context.userId}, ${songId}, now())
      on conflict (user_id, song_id) do nothing
    `;
    return { ok: true as const, songId, on: true as const };
  });

export const unmarkSingable = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((songId: unknown) => String(songId ?? "").trim().slice(0, 40))
  .handler(async ({ context, data: songId }) => {
    if (!songId) throw new Error("曲が指定されていません");
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql`
      delete from fuwari_singable
      where user_id = ${context.userId} and song_id = ${songId}
    `;
    return { ok: true as const, songId, on: false as const };
  });

export type SingersForSong = {
  total: number;
  singers: SingableSinger[];
};

export const listSingersForSong = createServerFn({ method: "GET" })
  .validator((songId: unknown) => String(songId ?? "").trim().slice(0, 40))
  .handler(async ({ data: songId }): Promise<SingersForSong> => {
    if (!songId) return { total: 0, singers: [] };
    try {
      const { getSql } = await import("@/lib/db");
      const sql = await getSql();
      const totalRows = await sql<{ n: number }>`
        select count(*)::int as n from fuwari_singable where song_id = ${songId}
      `;
      const rows = await sql<{
        soul_id: string;
        display_name: string;
        avatar_url: string;
        range_min_note: string;
        range_max_note: string;
        created_at: string | Date | null;
      }>`
        select p.soul_id, p.display_name, p.avatar_url,
               p.range_min_note, p.range_max_note, m.created_at
        from fuwari_singable m
        join fuwari_profiles p on p.user_id = m.user_id
        where m.song_id = ${songId}
          and p.is_public = true
        order by m.created_at desc
        limit 80
      `;
      return {
        total: Number(totalRows[0]?.n) || 0,
        singers: rows.map((r) => ({
          soulId: r.soul_id || "",
          displayName: (r.display_name || r.soul_id || "歌い手").slice(0, 80),
          avatarUrl: r.avatar_url || "",
          rangeMinNote: r.range_min_note || "",
          rangeMaxNote: r.range_max_note || "",
          markedAt: asIso(r.created_at),
        })),
      };
    } catch {
      return { total: 0, singers: [] };
    }
  });
