import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ListMusic,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useIsAdmin } from "@/lib/admin/use-is-admin";
import { addSong, deleteSong, listOriginals, searchSongs } from "@/lib/songdb/server";
import { whichSingableOn, type MarkInfo } from "@/lib/profile/list-ops";
import { useListTarget } from "@/lib/profile/list-target";
import { CanSingButton } from "@/components/editor/can-sing-button";
import { ListTargetBar } from "@/components/editor/list-target-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { SongRowSkeleton } from "@/components/ui/skeleton";
import { SongVocalFields } from "@/components/editor/song-vocal-fields";
import {
  KARAOKE_PLATFORMS,
  PLATFORM_GROUPS,
  SEARCH_MODES,
  SONG_GENRES,
  genreLabel,
  platformLabel,
  songCode,
  vocalMetaLabel,
  type KaraokePlatformId,
  type SearchModeId,
  type Song,
  type SongDraft,
  type SongGenreId,
  type SongOriginalRef,
} from "@/lib/songdb/types";

const emptyDraft: SongDraft = {
  title: "",
  artist: "",
  titleKana: "",
  artistKana: "",
  lyricist: "",
  composer: "",
  genre: "other",
  tieup: "",
  mgmtNo: "",
  karaokeNo: "",
  platforms: [],
  lyrics: "",
  keyNote: "",
  vocalMinNote: "",
  vocalMaxNote: "",
  bpm: 0,
  youtubeUrl: "",
  originalCode: "",
  arrangement: "",
};

export function SongdbPanel({ arrangeCode = "" }: { arrangeCode?: string }) {
  const { user, isPending } = useCurrentUserState();
  const { admin } = useIsAdmin();
  const { soulId } = useListTarget();
  const [q, setQ] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [mode, setMode] = useState<SearchModeId>("all");
  const [genre, setGenre] = useState<SongGenreId>("all");
  const [platform, setPlatform] = useState<KaraokePlatformId | "all">("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [songs, setSongs] = useState<Song[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<SongDraft>({
    ...emptyDraft,
    originalCode: arrangeCode,
    arrangement: arrangeCode ? "アレンジ" : "",
  });
  const [saving, setSaving] = useState(false);
  const [pickedOriginal, setPickedOriginal] = useState<SongOriginalRef | null>(
    null,
  );
  const [singable, setSingable] = useState<Record<string, MarkInfo>>({});
  const pageSize = 20;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const load = async (
    next: {
      q?: string;
      mode?: SearchModeId;
      genre?: SongGenreId;
      platform?: KaraokePlatformId | "all";
      page?: number;
    } = {},
  ) => {
    const query = next.q ?? submitted;
    const m = next.mode ?? mode;
    const g = next.genre ?? genre;
    const plat = next.platform ?? platform;
    const p = next.page ?? page;
    setBusy(true);
    setError("");
    try {
      const res = await searchSongs({
        data: { q: query, mode: m, genre: g, platform: plat, page: p, pageSize },
      });
      setSongs(res.songs);
      setTotal(res.total);
      setPage(res.page);
    } catch (e) {
      setError(e instanceof Error ? e.message : "検索に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void load({ page: 1, q: "" });
    // initial catalog
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user) {
      setSingable({});
      return;
    }
    const ids = songs.map((s) => s.id);
    if (!ids.length) {
      setSingable({});
      return;
    }
    void whichSingableOn({ data: { ids, targetSoulId: soulId || undefined } })
      .then((rows) => {
        const next: Record<string, MarkInfo> = {};
        for (const r of rows) next[r.songId] = r;
        setSingable(next);
      })
      .catch(() => setSingable({}));
  }, [user, songs, soulId]);

  useEffect(() => {
    if (!arrangeCode) return;
    setShowForm(true);
    setDraft((d) => ({
      ...d,
      originalCode: arrangeCode,
      arrangement: d.arrangement || "アレンジ",
    }));
    void listOriginals({ data: { q: arrangeCode } })
      .then((rows) => {
        const hit =
          rows.find((r) => r.mgmtNo.toLowerCase() === arrangeCode.toLowerCase()) ??
          rows[0] ??
          null;
        setPickedOriginal(hit);
      })
      .catch(() => setPickedOriginal({ mgmtNo: arrangeCode, karaokeNo: "", title: arrangeCode, artist: "" }));
  }, [arrangeCode]);

  const runSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    setSubmitted(q.trim());
    setPage(1);
    void load({ q: q.trim(), page: 1 });
  };

  const onGenre = (id: SongGenreId) => {
    setGenre(id);
    setPage(1);
    void load({ genre: id, page: 1 });
  };

  const onPlatform = (id: KaraokePlatformId | "all") => {
    setPlatform(id);
    setPage(1);
    void load({ platform: id, page: 1 });
  };

  const onMode = (id: SearchModeId) => {
    setMode(id);
    setPage(1);
    void load({ mode: id, page: 1 });
  };

  const hint = useMemo(() => {
    if (submitted) {
      return `「${submitted}」 ${total} 件`;
    }
    return `登録曲 ${total} 件 · 曲名・歌手・歌詞の一部から探せます`;
  }, [submitted, total]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await addSong({ data: draft });
      if (!res.song) {
        setError("登録に失敗しました");
        return;
      }
      setDraft(emptyDraft);
      setPickedOriginal(null);
      setShowForm(false);
      await load({ page: 1 });
    } catch (err) {
      setError(err instanceof Error ? err.message : "登録に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string, title: string) => {
    if (!window.confirm(`「${title}」を削除します。元に戻せません。`)) return;
    setError("");
    try {
      const res = await deleteSong({ data: id });
      if (!res.ok) {
        setError(res.error ?? "削除に失敗しました");
        return;
      }
      setOpenId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
    }
  };

  const patchMark = (
    id: string,
    on: boolean,
    info?: { source: "self" | "proxy"; canRevoke: boolean },
  ) => {
    setSingable((prev) => {
      const next = { ...prev };
      if (on) {
        next[id] = {
          songId: id,
          source: info?.source ?? (soulId ? "proxy" : "self"),
          canRevoke: info?.canRevoke ?? Boolean(soulId),
        };
      } else {
        delete next[id];
      }
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Search className="size-4 text-primary" />
          曲名・歌手名・番組名からさがす
        </h2>
        <p className="mb-3 text-[11px] text-muted-foreground">{hint}</p>

        <form onSubmit={runSearch} className="flex flex-col gap-2 sm:flex-row">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="曲名 / 歌手 / 歌詞のひと節 / 管理番号"
            className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="楽曲キーワード"
          />
          <Button type="submit" className="h-11 rounded-xl px-5" disabled={busy}>
            {busy ? "検索中…" : "さがす"}
          </Button>
        </form>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {SEARCH_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onMode(m.id)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors duration-150",
                mode === m.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-muted/40 text-muted-foreground hover:text-foreground",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="mt-3">
          <div className="mb-1.5 text-[10px] font-medium text-muted-foreground">
            絞り込み
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SONG_GENRES.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => onGenre(g.id)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors duration-150",
                  genre === g.id
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                {g.label}
              </button>
            ))}
          </div>
          <div className="mt-3 mb-1.5 text-[10px] font-medium text-muted-foreground">
            歌えるところ
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => onPlatform("all")}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors duration-150",
                platform === "all"
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              すべて
            </button>
            {KARAOKE_PLATFORMS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onPlatform(p.id)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors duration-150",
                  platform === p.id
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <ListTargetBar />

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ListMusic className="size-4 text-primary" />
            {submitted ? "検索結果" : "楽曲リスト"}
          </h2>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {busy ? "検索中…" : `${total} 曲`}
          </span>
        </div>

        {error && (
          <p className="border-b border-border bg-danger-soft px-4 py-2 text-xs text-danger">
            {error}
          </p>
        )}

        {busy && songs.length === 0 ? (
          <SongRowSkeleton rows={8} />
        ) : songs.length === 0 ? (
          <EmptyState
            icon={Search}
            title={submitted ? "見つかりませんでした" : "まだ曲がありません"}
            description={
              submitted
                ? "キーワードやジャンルを変えてみてください。"
                : "下の「新規登録」から、歌いたい曲をカタログに残せます。"
            }
            className="py-12"
          />
        ) : (
          <ul className="divide-y divide-border">
            {songs.map((s, i) => {
              const open = openId === s.id;
              const mine = Boolean(user && s.createdBy && s.createdBy === user.id);
              const canDelete = mine || admin;
              return (
                <li key={s.id} className="transition-colors duration-150 hover:bg-muted/35">
                  <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:flex-nowrap sm:px-4">
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : s.id)}
                    className="flex min-w-0 flex-1 items-start gap-3 py-0.5 text-left hover:opacity-90"
                  >
                    <span className="w-8 shrink-0 pt-0.5 text-right text-[11px] tabular-nums text-muted-foreground">
                      {(page - 1) * pageSize + i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-foreground">
                        {s.title}
                      </span>
                      <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                        {s.artist}
                        {s.originalCode
                          ? ` · 原曲 ${s.originalTitle || s.originalCode}`
                          : ""}
                        {s.arrangement ? ` · ${s.arrangement}` : ""}
                        {s.tieup ? ` · ${s.tieup}` : ""}
                        {vocalMetaLabel(s) ? ` · ${vocalMetaLabel(s)}` : ""}
                        {s.platforms.length
                          ? ` · ${s.platforms.map(platformLabel).join(" / ")}`
                          : ""}
                      </span>
                    </span>
                    <span className="hidden shrink-0 text-right sm:block">
                      <span className="block text-[10px] text-muted-foreground">
                        {genreLabel(s.genre)}
                      </span>
                      <span className="mt-0.5 block font-mono text-[11px] tabular-nums text-foreground">
                        {songCode(s)}
                      </span>
                    </span>
                  </button>
                  <CanSingButton
                    songId={s.id}
                    marked={Boolean(singable[s.id])}
                    source={singable[s.id]?.source ?? "self"}
                    canRevoke={Boolean(singable[s.id]?.canRevoke)}
                    onChange={(on, info) => patchMark(s.id, on, info)}
                  />
                  </div>
                  {open && (
                    <div className="space-y-2 border-t border-border bg-muted/20 px-4 py-3 text-xs text-foreground">
                      {songCode(s) ? (
                        <Link
                          to="/songdb/$code"
                          params={{ code: songCode(s) }}
                          className="block rounded-xl outline-none transition-colors hover:bg-background/70 focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <SongPreview song={s} />
                          <p className="mt-2 text-[10px] text-primary">
                            詳細ページを開く · /songdb/{songCode(s)}
                          </p>
                        </Link>
                      ) : (
                        <SongPreview song={s} />
                      )}
                      <div className="pt-1">
                        <CanSingButton
                          songId={s.id}
                          marked={Boolean(singable[s.id])}
                          source={singable[s.id]?.source ?? "self"}
                          canRevoke={Boolean(singable[s.id]?.canRevoke)}
                          onChange={(on, info) => patchMark(s.id, on, info)}
                        />
                      </div>
                      {s.youtubeUrl && (
                        <a
                          href={s.youtubeUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-block text-primary underline-offset-2 hover:underline"
                        >
                          YouTube で見る
                        </a>
                      )}
                      {canDelete && (
                        <div className="pt-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => void remove(s.id, s.title)}
                          >
                            <Trash2 className="size-3.5" />
                            この曲を削除
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-center gap-2 border-t border-border px-4 py-3">
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              disabled={page <= 1 || busy}
              onClick={() => void load({ page: page - 1 })}
              aria-label="前のページ"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {page} / {pages}
            </span>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              disabled={page >= pages || busy}
              onClick={() => void load({ page: page + 1 })}
              aria-label="次のページ"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">曲を登録する</h2>
          {!isPending && user ? (
            <Button
              type="button"
              size="sm"
              variant={showForm ? "secondary" : "default"}
              onClick={() => setShowForm((v) => !v)}
            >
              <Plus className="size-3.5" />
              {showForm ? "閉じる" : "新規登録"}
            </Button>
          ) : (
            <Button asChild size="sm" variant="secondary">
              <Link to="/login">サインインして登録</Link>
            </Button>
          )}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          歌いたい曲をカタログに残します。JOYSOUND の配信曲そのものの複製ではありません。
        </p>
        {showForm && user && (
          <form onSubmit={save} className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field
              label="曲名"
              required
              value={draft.title}
              onChange={(v) => setDraft({ ...draft, title: v })}
            />
            <Field
              label="歌手名"
              required
              value={draft.artist}
              onChange={(v) => setDraft({ ...draft, artist: v })}
            />
            <Field
              label="曲名よみ"
              value={draft.titleKana ?? ""}
              onChange={(v) => setDraft({ ...draft, titleKana: v })}
            />
            <Field
              label="歌手よみ"
              value={draft.artistKana ?? ""}
              onChange={(v) => setDraft({ ...draft, artistKana: v })}
            />
            <Field
              label="作詞"
              value={draft.lyricist ?? ""}
              onChange={(v) => setDraft({ ...draft, lyricist: v })}
            />
            <Field
              label="作曲"
              value={draft.composer ?? ""}
              onChange={(v) => setDraft({ ...draft, composer: v })}
            />
            <label className="block text-[11px] font-medium text-muted-foreground">
              ジャンル
              <select
                className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={draft.genre ?? "other"}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    genre: e.target.value as SongDraft["genre"],
                  })
                }
              >
                {SONG_GENRES.filter((g) => g.id !== "all").map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
            </label>
            <Field
              label="管理番号（空なら FW-0001… を自動）"
              value={draft.mgmtNo ?? ""}
              onChange={(v) => setDraft({ ...draft, mgmtNo: v })}
            />
            <Field
              label="番組・タイアップ"
              value={draft.tieup ?? ""}
              onChange={(v) => setDraft({ ...draft, tieup: v })}
            />
            <Field
              label="原曲キー"
              value={draft.keyNote ?? ""}
              onChange={(v) => setDraft({ ...draft, keyNote: v })}
            />
            <SongVocalFields
              vocalMinNote={draft.vocalMinNote ?? ""}
              vocalMaxNote={draft.vocalMaxNote ?? ""}
              bpm={draft.bpm ?? 0}
              onChange={(next) => setDraft({ ...draft, ...next })}
            />
            <label className="block text-[11px] font-medium text-muted-foreground sm:col-span-2">
              原曲
              <OriginalPicker
                value={draft.originalCode ?? ""}
                selected={pickedOriginal}
                onChange={(code, ref) => {
                  setPickedOriginal(ref);
                  setDraft({
                    ...draft,
                    originalCode: code,
                    arrangement: code
                      ? draft.arrangement || "アレンジ"
                      : "",
                  });
                }}
              />
            </label>
            {draft.originalCode ? (
              <ArrangementNameField
                value={draft.arrangement ?? ""}
                onChange={(v) => setDraft({ ...draft, arrangement: v })}
              />
            ) : null}
            <fieldset className="sm:col-span-2">
              <legend className="text-[11px] font-medium text-muted-foreground">
                歌えるところ（独自音源のある配信先）
              </legend>
              <PlatformChecks
                value={draft.platforms ?? []}
                onChange={(platforms) => setDraft({ ...draft, platforms })}
              />
            </fieldset>
            <label className="block text-[11px] font-medium text-muted-foreground sm:col-span-2">
              YouTube URL（公式埋め込み用）
              <input
                value={draft.youtubeUrl ?? ""}
                onChange={(e) => setDraft({ ...draft, youtubeUrl: e.target.value })}
                className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <label className="block text-[11px] font-medium text-muted-foreground sm:col-span-2">
              歌詞・歌い出し（検索用）
              <textarea
                value={draft.lyrics ?? ""}
                onChange={(e) => setDraft({ ...draft, lyrics: e.target.value })}
                rows={4}
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={saving}>
                {saving ? "登録中…" : "カタログに入れる"}
              </Button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

function SongPreview({ song }: { song: Song }) {
  return (
    <>
      <dl className="grid gap-1 sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">よみ</dt>
          <dd>
            {song.titleKana || "—"} / {song.artistKana || "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">作詞 / 作曲</dt>
          <dd>
            {song.lyricist || "—"} / {song.composer || "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">原曲キー</dt>
          <dd>{song.keyNote || "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">声域</dt>
          <dd>
            {song.vocalMinNote || song.vocalMaxNote
              ? `${song.vocalMinNote || "?"} 〜 ${song.vocalMaxNote || "?"}`
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">BPM</dt>
          <dd>{song.bpm > 0 ? song.bpm : "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">原曲</dt>
          <dd>
            {song.originalCode
              ? `${song.originalTitle || song.originalCode}${song.arrangement ? ` · ${song.arrangement}` : ""}`
              : "この曲が原曲"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">番組・タイアップ</dt>
          <dd>{song.tieup || "—"}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-muted-foreground">歌えるところ</dt>
          <dd>
            {song.platforms.length
              ? song.platforms.map(platformLabel).join(" · ")
              : "未登録"}
          </dd>
        </div>
      </dl>
      {song.lyrics && (
        <p className="mt-2 whitespace-pre-wrap rounded-xl border border-border bg-background px-3 py-2 leading-relaxed text-muted-foreground">
          {song.lyrics}
        </p>
      )}
    </>
  );
}

function PlatformChecks({
  value,
  onChange,
}: {
  value: KaraokePlatformId[];
  onChange: (next: KaraokePlatformId[]) => void;
}) {
  const toggle = (id: KaraokePlatformId) => {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  };
  return (
    <div className="mt-2 space-y-2">
      {PLATFORM_GROUPS.map((group) => (
        <div key={group}>
          <div className="mb-1 text-[10px] text-muted-foreground">{group}</div>
          <div className="flex flex-wrap gap-x-3 gap-y-1.5">
            {KARAOKE_PLATFORMS.filter((p) => p.group === group).map((p) => (
              <label
                key={p.id}
                className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-foreground"
              >
                <input
                  type="checkbox"
                  checked={value.includes(p.id)}
                  onChange={() => toggle(p.id)}
                  className="size-3.5 accent-primary"
                />
                {p.label}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function OriginalPicker({
  value,
  selected,
  onChange,
}: {
  value: string;
  selected: SongOriginalRef | null;
  onChange: (code: string, ref: SongOriginalRef | null) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<SongOriginalRef[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      setBusy(true);
      void listOriginals({ data: { q } })
        .then(setHits)
        .catch(() => setHits([]))
        .finally(() => setBusy(false));
    }, 180);
    return () => window.clearTimeout(t);
  }, [q, open]);

  if (value) {
    const title = selected?.title || value;
    const artist = selected?.artist || "";
    return (
      <div className="mt-1 flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-foreground">{title}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {artist ? `${artist} · ` : ""}
            {value}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => onChange("", null)}
        >
          外す
        </Button>
      </div>
    );
  }

  return (
    <div className="relative mt-1">
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 180)}
        placeholder="曲名・歌手・管理番号で検索（空ならこの曲が原曲）"
        className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {open && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-border bg-card py-1 shadow-lg">
          <li>
            <button
              type="button"
              className="w-full px-3 py-2 text-left text-[12px] text-muted-foreground hover:bg-muted/50"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange("", null);
                setQ("");
                setOpen(false);
              }}
            >
              この曲が原曲（アレンジ元）
            </button>
          </li>
          {busy && (
            <li className="px-3 py-2 text-[11px] text-muted-foreground">検索中…</li>
          )}
          {!busy && hits.length === 0 && (
            <li className="px-3 py-2 text-[11px] text-muted-foreground">
              {q ? "見つかりません" : "最近の原曲"}
            </li>
          )}
          {hits.map((o) => (
            <li key={o.mgmtNo}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left hover:bg-muted/50"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(o.mgmtNo, o);
                  setQ("");
                  setOpen(false);
                }}
              >
                <span className="block truncate text-sm text-foreground">
                  {o.title}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {o.artist} · {o.mgmtNo}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const ARRANGEMENT_EXAMPLES = [
  "英語詞",
  "キー+3",
  "ボカロカバー",
  "ピアノ伴奏",
  "ライブアレンジ",
  "令和アレンジ",
];

function ArrangementNameField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
        アレンジ名
        <button
          type="button"
          className="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="アレンジ名の例"
          onClick={() => setOpen((v) => !v)}
        >
          <CircleHelp className="size-3.5" />
        </button>
      </div>
      {open && (
        <div className="absolute left-0 top-6 z-20 w-[min(100%,18rem)] rounded-xl border border-border bg-card p-3 text-left shadow-lg">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            原曲と区別する短いラベルです。曲名や管理番号は入れなくて大丈夫。空なら「アレンジ」になります。
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {ARRANGEMENT_EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-foreground hover:border-primary hover:bg-primary/10"
                onClick={() => {
                  onChange(ex);
                  setOpen(false);
                }}
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="例: 英語詞"
        className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block text-[11px] font-medium text-muted-foreground">
      {label}
      {required ? " *" : ""}
      <input
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </label>
  );
}
