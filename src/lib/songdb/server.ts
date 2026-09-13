import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  KARAOKE_PLATFORMS,
  SEARCH_MODES,
  SONG_GENRES,
  parsePlatformIds,
  type KaraokePlatformId,
  type SearchModeId,
  type Song,
  type SongDetailPayload,
  type SongDraft,
  type SongGenreId,
  type SongOriginalRef,
  type SongSearchInput,
  type SongSearchResult,
} from "./types";

type SongRow = {
  id: string;
  title: string;
  title_kana: string;
  artist: string;
  artist_kana: string;
  lyricist: string;
  composer: string;
  genre: string;
  tieup: string;
  mgmt_no: string;
  karaoke_no: string;
  platforms_json?: string;
  lyrics: string;
  key_note: string;
  vocal_min_note?: string;
  vocal_max_note?: string;
  bpm?: number;
  youtube_url: string;
  original_code: string;
  arrangement: string;
  orig_title?: string | null;
  orig_artist?: string | null;
  created_by: string;
  created_at: string | Date | null;
  updated_at: string | Date | null;
};

const GENRE_IDS = new Set(SONG_GENRES.map((g) => g.id));
const MODE_IDS = new Set(SEARCH_MODES.map((m) => m.id));

const PLATFORM_IDS = new Set<string>(KARAOKE_PLATFORMS.map((p) => p.id));

function asIso(v: string | Date | null | undefined) {
  if (!v) return null;
  return typeof v === "string" ? v : v.toISOString();
}

function rowToSong(row: SongRow): Song {
  const genre = (
    (GENRE_IDS as Set<string>).has(row.genre) && row.genre !== "all"
      ? row.genre
      : "other"
  ) as Song["genre"];
  return {
    id: row.id,
    title: row.title,
    titleKana: row.title_kana,
    artist: row.artist,
    artistKana: row.artist_kana,
    lyricist: row.lyricist,
    composer: row.composer,
    genre,
    tieup: row.tieup,
    mgmtNo: row.mgmt_no ?? "",
    karaokeNo: row.karaoke_no,
    platforms: parsePlatformIds(row.platforms_json ?? "[]"),
    lyrics: row.lyrics,
    keyNote: row.key_note,
    vocalMinNote: row.vocal_min_note ?? "",
    vocalMaxNote: row.vocal_max_note ?? "",
    bpm: Number(row.bpm) > 0 ? Math.round(Number(row.bpm)) : 0,
    youtubeUrl: row.youtube_url,
    originalCode: row.original_code ?? "",
    arrangement: row.arrangement ?? "",
    originalTitle: row.orig_title ?? "",
    originalArtist: row.orig_artist ?? "",
    createdBy: row.created_by,
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at),
  };
}

function clip(v: unknown, max: number) {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function likeNeedle(q: string) {
  return `%${q.replace(/[%_\\]/g, "")}%`;
}

function parseSearch(raw: unknown): Required<
  Pick<SongSearchInput, "q" | "mode" | "genre" | "platform" | "page" | "pageSize">
> {
  const o = (raw ?? {}) as SongSearchInput;
  const mode = (MODE_IDS as Set<string>).has(String(o.mode ?? ""))
    ? (o.mode as SearchModeId)
    : "all";
  const genre = (GENRE_IDS as Set<string>).has(String(o.genre ?? ""))
    ? (o.genre as SongGenreId)
    : "all";
  const platform = PLATFORM_IDS.has(String(o.platform ?? ""))
    ? (o.platform as KaraokePlatformId)
    : "all";
  const page = Math.max(1, Math.floor(Number(o.page) || 1));
  const pageSize = Math.min(50, Math.max(5, Math.floor(Number(o.pageSize) || 20)));
  return { q: clip(o.q, 80), mode, genre, platform, page, pageSize };
}

function parseBpm(raw: unknown) {
  if (raw == null || raw === "") return 0;
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(400, Math.max(20, n));
}

function parseDraft(raw: unknown): SongDraft | { error: string } {
  const o = (raw ?? {}) as SongDraft;
  const title = clip(o.title, 120);
  const artist = clip(o.artist, 120);
  if (title.length < 1) return { error: "曲名を入れてください" };
  if (artist.length < 1) return { error: "歌手名を入れてください" };
  const genreRaw = clip(o.genre, 20);
  const genre = (
    (GENRE_IDS as Set<string>).has(genreRaw) && genreRaw !== "all"
      ? genreRaw
      : "other"
  ) as Song["genre"];
  return {
    title,
    titleKana: clip(o.titleKana, 120),
    artist,
    artistKana: clip(o.artistKana, 120),
    lyricist: clip(o.lyricist, 80),
    composer: clip(o.composer, 80),
    genre,
    tieup: clip(o.tieup, 160),
    mgmtNo: clip(o.mgmtNo, 24),
    karaokeNo: clip(o.karaokeNo, 24),
    platforms: parsePlatformIds(o.platforms),
    lyrics: String(o.lyrics ?? "").trim().slice(0, 8000),
    keyNote: clip(o.keyNote, 12),
    vocalMinNote: clip(o.vocalMinNote, 8),
    vocalMaxNote: clip(o.vocalMaxNote, 8),
    bpm: parseBpm(o.bpm),
    youtubeUrl: clip(o.youtubeUrl, 200),
    originalCode: clip(o.originalCode, 24),
    arrangement: clip(o.arrangement, 80),
  };
}

function whereClause(
  q: string,
  mode: SearchModeId,
  genre: SongGenreId,
  platform: KaraokePlatformId | "all",
  alias = "",
) {
  const col = (name: string) => `${alias}${name}`;
  const clauses: string[] = [];
  const params: unknown[] = [];
  const add = (fragment: string, ...vals: unknown[]) => {
    let out = fragment;
    for (const v of vals) {
      params.push(v);
      out = out.replace("?", `$${params.length}`);
    }
    clauses.push(out);
  };
  if (genre !== "all") add(`${col("genre")} = ?`, genre);
  if (platform !== "all") {
    add(`${col("platforms_json")} ilike ?`, `%"${platform}"%`);
  }
  if (q) {
    const n = likeNeedle(q);
    if (mode === "title") {
      add(`(${col("title")} ilike ? or ${col("title_kana")} ilike ?)`, n, n);
    } else if (mode === "artist") {
      add(`(${col("artist")} ilike ? or ${col("artist_kana")} ilike ?)`, n, n);
    } else if (mode === "lyrics") {
      add(`${col("lyrics")} ilike ?`, n);
    } else if (mode === "tieup") {
      add(`${col("tieup")} ilike ?`, n);
    } else if (mode === "mgmt") {
      add(`${col("mgmt_no")} ilike ?`, n);
    } else if (mode === "credit") {
      add(`(${col("lyricist")} ilike ? or ${col("composer")} ilike ?)`, n, n);
    } else if (mode === "original") {
      add(
        `(${col("original_code")} ilike ? or ((${col("original_code")} = '' or ${col("original_code")} is null) and (${col("title")} ilike ? or ${col("title_kana")} ilike ?)))`,
        n,
        n,
        n,
      );
    } else {
      add(
        `(${col("title")} ilike ? or ${col("title_kana")} ilike ? or ${col("artist")} ilike ? or ${col("artist_kana")} ilike ? or ${col("tieup")} ilike ? or ${col("original_code")} ilike ? or ${col("arrangement")} ilike ? or ${col("mgmt_no")} ilike ? or ${col("karaoke_no")} ilike ?)`,
        n,
        n,
        n,
        n,
        n,
        n,
        n,
        n,
        n,
      );
    }
  }
  return {
    sql: clauses.length ? `where ${clauses.join(" and ")}` : "",
    params,
  };
}

type SqlClient = {
  <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]>;
  query<T = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<T[]>;
};

async function lookupByCode(sql: SqlClient, code: string) {
  const rows = await sql<SongRow>`
    select s.*, o.title as orig_title, o.artist as orig_artist
    from fuwari_songs s
    left join fuwari_songs o
      on o.mgmt_no <> '' and lower(o.mgmt_no) = lower(s.original_code)
    where s.mgmt_no ilike ${code}
       or s.karaoke_no ilike ${code}
       or s.id = ${code}
    limit 1
  `;
  return rows[0] ? rowToSong(rows[0]) : null;
}

async function resolveOriginalCode(
  sql: SqlClient,
  code: string,
  selfKaraoke = "",
) {
  const wanted = clip(code, 24);
  if (!wanted) return "";
  const hit = await sql<{ mgmt_no: string; original_code: string }>`
    select mgmt_no, original_code from fuwari_songs
    where mgmt_no ilike ${wanted} or karaoke_no ilike ${wanted} or id = ${wanted}
    limit 1
  `;
  const row = hit[0];
  if (!row) throw new Error("原曲の管理番号が見つかりません");
  const root = row.original_code || row.mgmt_no;
  if (selfKaraoke && root.toLowerCase() === selfKaraoke.toLowerCase()) {
    throw new Error("自分自身を原曲にはできません");
  }
  return root;
}

export const searchSongs = createServerFn({ method: "GET" })
  .validator((raw: unknown) => parseSearch(raw))
  .handler(async ({ data }): Promise<SongSearchResult> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const { q, mode, genre, platform, page, pageSize } = data;
    const countWhere = whereClause(q, mode, genre, platform);
    const listWhere = whereClause(q, mode, genre, platform, "s.");
    const offset = (page - 1) * pageSize;
    const countRows = await sql.query<{ n: number }>(
      `select count(*)::int as n from fuwari_songs ${countWhere.sql}`,
      countWhere.params,
    );
    const total = Number(countRows[0]?.n ?? 0);
    const rows = await sql.query<SongRow>(
      `select s.*, o.title as orig_title, o.artist as orig_artist
       from fuwari_songs s
       left join fuwari_songs o
         on o.mgmt_no <> '' and lower(o.mgmt_no) = lower(s.original_code)
       ${listWhere.sql}
       order by s.updated_at desc, s.title asc
       limit $${listWhere.params.length + 1} offset $${listWhere.params.length + 2}`,
      [...listWhere.params, pageSize, offset],
    );
    return {
      songs: rows.map(rowToSong),
      total,
      page,
      pageSize,
    };
  });

export const getSongByCode = createServerFn({ method: "GET" })
  .validator((raw: unknown) => clip(raw, 24))
  .handler(async ({ data: code }): Promise<SongDetailPayload | null> => {
    if (!code) return null;
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const song = await lookupByCode(sql, code);
    if (!song) return null;
    let original: Song | null = null;
    if (song.originalCode) {
      original = await lookupByCode(sql, song.originalCode);
    }
    const root = original?.mgmtNo || (!song.originalCode ? song.mgmtNo : "");
    const countRows = root
      ? await sql<{ n: number }>`
          select count(*)::int as n from fuwari_songs
          where lower(original_code) = lower(${root})
            and id <> ${song.id}
        `
      : [];
    return {
      song,
      original,
      arrangements: [],
      arrangementTotal: Number(countRows[0]?.n) || 0,
    };
  });

export const listOriginals = createServerFn({ method: "GET" })
  .validator((raw: unknown) => {
    const o = (raw ?? {}) as { q?: string };
    return { q: String(o.q ?? "").trim().slice(0, 80) };
  })
  .handler(async ({ data }): Promise<SongOriginalRef[]> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const q = data.q;
    const rows = q
      ? await sql<{
          mgmt_no: string;
          karaoke_no: string;
          title: string;
          artist: string;
        }>`
          select mgmt_no, karaoke_no, title, artist from fuwari_songs
          where mgmt_no <> ''
            and (original_code = '' or original_code is null)
            and (
              title ilike ${"%" + q + "%"}
              or artist ilike ${"%" + q + "%"}
              or title_kana ilike ${"%" + q + "%"}
              or artist_kana ilike ${"%" + q + "%"}
              or mgmt_no ilike ${"%" + q + "%"}
            )
          order by title asc
          limit 12
        `
      : await sql<{
          mgmt_no: string;
          karaoke_no: string;
          title: string;
          artist: string;
        }>`
          select mgmt_no, karaoke_no, title, artist from fuwari_songs
          where mgmt_no <> ''
            and (original_code = '' or original_code is null)
          order by updated_at desc, title asc
          limit 8
        `;
    return rows.map((r) => ({
      mgmtNo: r.mgmt_no,
      karaokeNo: r.karaoke_no,
      title: r.title,
      artist: r.artist,
    }));
  });

export const listArrangements = createServerFn({ method: "GET" })
  .validator((raw: unknown) => {
    const o = (raw ?? {}) as {
      originalCode?: string;
      q?: string;
      page?: number;
      pageSize?: number;
      excludeId?: string;
    };
    return {
      originalCode: clip(o.originalCode, 24),
      q: clip(o.q, 80),
      page: Math.max(1, Math.floor(Number(o.page) || 1)),
      pageSize: Math.min(50, Math.max(5, Math.floor(Number(o.pageSize) || 20))),
      excludeId: clip(o.excludeId, 40),
    };
  })
  .handler(async ({ data }) => {
    if (!data.originalCode) {
      return { songs: [] as Song[], total: 0, page: 1, pageSize: data.pageSize };
    }
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const code = data.originalCode;
    const exclude = data.excludeId;
    const needle = data.q ? `%${data.q}%` : "";
    const offset = (data.page - 1) * data.pageSize;
    const countRows = needle
      ? await sql<{ n: number }>`
          select count(*)::int as n from fuwari_songs
          where lower(original_code) = lower(${code})
            and (${exclude} = '' or id <> ${exclude})
            and (
              title ilike ${needle} or artist ilike ${needle}
              or arrangement ilike ${needle} or mgmt_no ilike ${needle}
            )
        `
      : await sql<{ n: number }>`
          select count(*)::int as n from fuwari_songs
          where lower(original_code) = lower(${code})
            and (${exclude} = '' or id <> ${exclude})
        `;
    const total = Number(countRows[0]?.n) || 0;
    const rows = needle
      ? await sql<SongRow>`
          select s.*, o.title as orig_title, o.artist as orig_artist
          from fuwari_songs s
          left join fuwari_songs o
            on o.mgmt_no <> '' and lower(o.mgmt_no) = lower(s.original_code)
          where lower(s.original_code) = lower(${code})
            and (${exclude} = '' or s.id <> ${exclude})
            and (
              s.title ilike ${needle} or s.artist ilike ${needle}
              or s.arrangement ilike ${needle} or s.mgmt_no ilike ${needle}
            )
          order by s.arrangement asc, s.title asc
          limit ${data.pageSize} offset ${offset}
        `
      : await sql<SongRow>`
          select s.*, o.title as orig_title, o.artist as orig_artist
          from fuwari_songs s
          left join fuwari_songs o
            on o.mgmt_no <> '' and lower(o.mgmt_no) = lower(s.original_code)
          where lower(s.original_code) = lower(${code})
            and (${exclude} = '' or s.id <> ${exclude})
          order by s.arrangement asc, s.title asc
          limit ${data.pageSize} offset ${offset}
        `;
    return {
      songs: rows.map(rowToSong),
      total,
      page: data.page,
      pageSize: data.pageSize,
    };
  });



export const addSong = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((raw: unknown) => {
    const d = parseDraft(raw);
    if ("error" in d) throw new Error(d.error);
    return d;
  })
  .handler(async ({ data, context }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    let mgmtNo = data.mgmtNo ?? "";
    if (mgmtNo) {
      const clash = await sql<{ n: number }>`
        select 1 as n from fuwari_songs where lower(mgmt_no) = lower(${mgmtNo}) limit 1
      `;
      if (clash[0]) throw new Error("その管理番号はすでに使われています");
    } else {
      const nums = await sql.query<{ n: number }>(
        `select coalesce(max(cast(substring(mgmt_no from 4) as int)), 0) as n
         from fuwari_songs
         where mgmt_no ~ '^FW-[0-9]+$'`,
      );
      const max = Number(nums[0]?.n) || 0;
      mgmtNo = `FW-${String(max + 1).padStart(4, "0")}`;
    }
    const karaokeNo = data.karaokeNo ?? "";
    const originalCode = await resolveOriginalCode(
      sql,
      data.originalCode ?? "",
      mgmtNo,
    );
    const arrangement = originalCode ? data.arrangement || "アレンジ" : "";
    const id = `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    await sql`
      insert into fuwari_songs (
        id, title, title_kana, artist, artist_kana, lyricist, composer,
        genre, tieup, mgmt_no, karaoke_no, platforms_json, lyrics, key_note,
        vocal_min_note, vocal_max_note, bpm, youtube_url,
        original_code, arrangement, created_by,
        created_at, updated_at
      ) values (
        ${id}, ${data.title}, ${data.titleKana ?? ""}, ${data.artist},
        ${data.artistKana ?? ""}, ${data.lyricist ?? ""}, ${data.composer ?? ""},
        ${data.genre ?? "other"}, ${data.tieup ?? ""}, ${mgmtNo}, ${karaokeNo},
        ${JSON.stringify(data.platforms ?? [])},
        ${data.lyrics ?? ""}, ${data.keyNote ?? ""},
        ${data.vocalMinNote ?? ""}, ${data.vocalMaxNote ?? ""}, ${data.bpm ?? 0},
        ${data.youtubeUrl ?? ""},
        ${originalCode}, ${arrangement},
        ${context.userId}, now(), now()
      )
    `;
    const rows = await sql<SongRow>`select * from fuwari_songs where id = ${id} limit 1`;
    return { ok: true as const, song: rows[0] ? rowToSong(rows[0]) : null };
  });

export const deleteSong = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: unknown) => clip(id, 40))
  .handler(async ({ data: id, context }) => {
    if (!id) return { ok: false as const, error: "曲が指定されていません" };
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<SongRow>`
      select * from fuwari_songs where id = ${id} limit 1
    `;
    const row = rows[0];
    if (!row) return { ok: false as const, error: "曲が見つかりません" };
    const { isAdminUser } = await import("@/lib/admin/server");
    const admin = await isAdminUser(context.userId);
    if (!admin) {
      if (row.created_by && row.created_by !== context.userId) {
        return { ok: false as const, error: "自分で登録した曲だけ消せます" };
      }
      if (!row.created_by) {
        return { ok: false as const, error: "最初から入っている曲は消せません" };
      }
    }
    await sql`delete from fuwari_singable where song_id = ${id}`;
    await sql`delete from fuwari_song_links where song_id = ${id}`;
    await sql`delete from fuwari_list_audit where song_id = ${id}`;
    if (admin) {
      await sql`delete from fuwari_songs where id = ${id}`;
    } else {
      await sql`delete from fuwari_songs where id = ${id} and created_by = ${context.userId}`;
    }
    return { ok: true as const };
  });

export const saveSongVocal = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((raw: unknown) => {
    const o = (raw ?? {}) as {
      id?: string;
      vocalMinNote?: string;
      vocalMaxNote?: string;
      bpm?: unknown;
    };
    const id = clip(o.id, 40);
    if (!id) throw new Error("曲が指定されていません");
    return {
      id,
      vocalMinNote: clip(o.vocalMinNote, 8),
      vocalMaxNote: clip(o.vocalMaxNote, 8),
      bpm: parseBpm(o.bpm),
    };
  })
  .handler(async ({ data, context }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<SongRow>`
      select * from fuwari_songs where id = ${data.id} limit 1
    `;
    const row = rows[0];
    if (!row) throw new Error("曲が見つかりません");
    const { isAdminUser } = await import("@/lib/admin/server");
    const admin = await isAdminUser(context.userId);
    if (!admin && row.created_by && row.created_by !== context.userId) {
      throw new Error("自分で登録した曲だけ声域を直せます");
    }
    await sql`
      update fuwari_songs
      set vocal_min_note = ${data.vocalMinNote},
          vocal_max_note = ${data.vocalMaxNote},
          bpm = ${data.bpm},
          updated_at = now()
      where id = ${data.id}
    `;
    const next = await sql<SongRow>`
      select * from fuwari_songs where id = ${data.id} limit 1
    `;
    return { ok: true as const, song: next[0] ? rowToSong(next[0]) : null };
  });
