export const SONG_GENRES = [
  { id: "all", label: "すべて" },
  { id: "jpop", label: "J-POP" },
  { id: "anime", label: "アニソン" },
  { id: "vocaloid", label: "ボカロ" },
  { id: "western", label: "洋楽" },
  { id: "kpop", label: "K-POP" },
  { id: "enka", label: "演歌" },
  { id: "doyo", label: "童謡・唱歌" },
  { id: "other", label: "その他" },
] as const;

export type SongGenreId = (typeof SONG_GENRES)[number]["id"];

export const SEARCH_MODES = [
  { id: "all", label: "曲名・歌手・番組" },
  { id: "title", label: "曲名" },
  { id: "artist", label: "歌手名" },
  { id: "lyrics", label: "歌詞の一部" },
  { id: "tieup", label: "番組・タイアップ" },
  { id: "mgmt", label: "管理番号" },
  { id: "credit", label: "作詞・作曲" },
  { id: "original", label: "原曲" },
] as const;

export type SearchModeId = (typeof SEARCH_MODES)[number]["id"];

export const KARAOKE_PLATFORMS = [
  { id: "dam", label: "DAM", group: "店舗" },
  { id: "joysound", label: "JOYSOUND", group: "店舗" },
  { id: "uga", label: "UGA", group: "店舗" },
  { id: "showroom", label: "SHOWROOMカラオケ", group: "配信" },
  { id: "colorsing", label: "カラーシング", group: "配信" },
  { id: "jsstreamer", label: "JOYSOUND for STREAMER", group: "配信" },
  { id: "jsapp", label: "カラオケJOYSOUND", group: "配信" },
  { id: "damtomo", label: "カラオケ@DAM", group: "配信" },
  { id: "topia", label: "トピア", group: "配信" },
  { id: "pococha", label: "ポコチャ", group: "配信" },
  { id: "mixch", label: "MIXCHANNEL", group: "配信" },
  { id: "live17", label: "17LIVE", group: "配信" },
  { id: "dokidoki", label: "Doki Doki Live", group: "配信" },
  { id: "utask", label: "うたスキ", group: "その他" },
  { id: "smule", label: "Smule", group: "その他" },
] as const;

export type KaraokePlatformId = (typeof KARAOKE_PLATFORMS)[number]["id"];

export const PLATFORM_GROUPS = ["店舗", "配信", "その他"] as const;

export type Song = {
  id: string;
  title: string;
  titleKana: string;
  artist: string;
  artistKana: string;
  lyricist: string;
  composer: string;
  genre: Exclude<SongGenreId, "all">;
  tieup: string;
  mgmtNo: string;
  karaokeNo: string;
  platforms: KaraokePlatformId[];
  lyrics: string;
  keyNote: string;
  vocalMinNote: string;
  vocalMaxNote: string;
  bpm: number;
  youtubeUrl: string;
  originalCode: string;
  arrangement: string;
  originalTitle: string;
  originalArtist: string;
  createdBy: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export type SongSearchInput = {
  q?: string;
  mode?: SearchModeId;
  genre?: SongGenreId;
  platform?: KaraokePlatformId | "all";
  page?: number;
  pageSize?: number;
};

export type SongSearchResult = {
  songs: Song[];
  total: number;
  page: number;
  pageSize: number;
};

export type SongDraft = {
  title: string;
  titleKana?: string;
  artist: string;
  artistKana?: string;
  lyricist?: string;
  composer?: string;
  genre?: Exclude<SongGenreId, "all">;
  tieup?: string;
  mgmtNo?: string;
  karaokeNo?: string;
  platforms?: KaraokePlatformId[];
  lyrics?: string;
  keyNote?: string;
  vocalMinNote?: string;
  vocalMaxNote?: string;
  bpm?: number;
  youtubeUrl?: string;
  originalCode?: string;
  arrangement?: string;
};

export type SongOriginalRef = {
  mgmtNo: string;
  karaokeNo: string;
  title: string;
  artist: string;
};

export type SongDetailPayload = {
  song: Song;
  original: Song | null;
  arrangements: Song[];
  arrangementTotal: number;
};

export function genreLabel(id: string) {
  return SONG_GENRES.find((g) => g.id === id)?.label ?? id;
}

export function platformLabel(id: string) {
  return KARAOKE_PLATFORMS.find((p) => p.id === id)?.label ?? id;
}

export function parsePlatformIds(raw: unknown): KaraokePlatformId[] {
  const allowed = new Set<string>(KARAOKE_PLATFORMS.map((p) => p.id));
  const src = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? (() => {
          try {
            const j = JSON.parse(raw);
            return Array.isArray(j) ? j : raw.split(/[,\s]+/);
          } catch {
            return raw.split(/[,\s]+/);
          }
        })()
      : [];
  const out: KaraokePlatformId[] = [];
  for (const item of src) {
    const id = String(item ?? "").trim();
    if (allowed.has(id) && !out.includes(id as KaraokePlatformId)) {
      out.push(id as KaraokePlatformId);
    }
  }
  return out;
}

export function songCode(song: Pick<Song, "mgmtNo" | "karaokeNo" | "id">) {
  return song.mgmtNo || song.karaokeNo || song.id;
}

export const VOCAL_NOTE_CHOICES = (() => {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const out: string[] = [];
  for (let oct = 2; oct <= 6; oct += 1) {
    for (const n of names) out.push(`${n}${oct}`);
  }
  return out;
})();

export function vocalRangeText(song: {
  vocalMinNote?: string;
  vocalMaxNote?: string;
}) {
  const lo = song.vocalMinNote?.trim() ?? "";
  const hi = song.vocalMaxNote?.trim() ?? "";
  if (lo && hi) return `${lo} 〜 ${hi}`;
  if (lo) return `${lo} 〜`;
  if (hi) return `〜 ${hi}`;
  return "";
}

export function vocalMetaLabel(song: {
  vocalMinNote?: string;
  vocalMaxNote?: string;
  bpm?: number;
}) {
  const range = vocalRangeText(song);
  const bpm = Number(song.bpm) > 0 ? `BPM ${song.bpm}` : "";
  return [range ? `声域 ${range}` : "", bpm].filter(Boolean).join(" · ");
}
