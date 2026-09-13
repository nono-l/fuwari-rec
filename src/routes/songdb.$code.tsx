import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ListMusic, Mic2, Music2, Plus, Search } from "lucide-react";
import { AppShell } from "@/components/editor/app-shell";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageSkeleton } from "@/components/ui/skeleton";
import { CanSingButton } from "@/components/editor/can-sing-button";
import { ListTargetBar } from "@/components/editor/list-target-bar";
import { SongListenLinks } from "@/components/editor/song-listen-links";
import { SongVocalFields } from "@/components/editor/song-vocal-fields";
import { getSongByCode, listArrangements, saveSongVocal } from "@/lib/songdb/server";
import { listSingersForSong } from "@/lib/profile/singable";
import { whichSingableOn, type MarkInfo } from "@/lib/profile/list-ops";
import { useListTarget } from "@/lib/profile/list-target";
import type { SingersForSong } from "@/lib/profile/singable";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useIsAdmin } from "@/lib/admin/use-is-admin";
import { genreLabel, platformLabel, songCode, vocalMetaLabel, vocalRangeText, type Song, type SongDetailPayload } from "@/lib/songdb/types";

export const Route = createFileRoute("/songdb/$code")({
  component: SongDetailPage,
  head: ({ params }) => ({
    meta: [{ title: `${params.code} — 楽曲リスト — Fuwari REC` }],
  }),
});

function SongDetailPage() {
  const { code } = Route.useParams();
  const [payload, setPayload] = useState<SongDetailPayload | null | undefined>(
    undefined,
  );

  useEffect(() => {
    let live = true;
    void getSongByCode({ data: code }).then((s) => {
      if (live) setPayload(s);
    });
    return () => {
      live = false;
    };
  }, [code]);

  const song = payload?.song;
  return (
    <AppShell
      title={song?.title ?? (payload === null ? "曲が見つかりません" : "楽曲")}
      description={
        song
          ? `${song.artist} · 管理番号 ${songCode(song)}`
          : undefined
      }
      transport={false}
    >
      {payload === undefined ? (
        <PageSkeleton cards={4} />
      ) : payload === null ? (
        <section className="rounded-2xl border border-border bg-card">
          <EmptyState
            icon={ListMusic}
            title="曲が見つかりません"
            description={`管理番号 ${code} の曲はありません。リストからさがしてみてください。`}
            action={
              <Button asChild size="sm" variant="secondary">
                <Link to="/songdb">
                  <ChevronLeft className="size-3.5" />
                  楽曲リストへ
                </Link>
              </Button>
            }
          />
        </section>
      ) : (
        <SongDetail payload={payload} />
      )}
    </AppShell>
  );
}

function SongDetail({ payload }: { payload: SongDetailPayload }) {
  const { original } = payload;
  const [song, setSong] = useState(payload.song);
  const rootCode = original?.mgmtNo || (!song.originalCode ? song.mgmtNo : "");
  const { user } = useCurrentUserState();
  const { admin } = useIsAdmin();
  const { soulId } = useListTarget();
  const [mark, setMark] = useState<MarkInfo | null>(null);
  const [singers, setSingers] = useState<SingersForSong>({ total: 0, singers: [] });

  useEffect(() => {
    setSong(payload.song);
  }, [payload.song]);

  const loadSingers = () => {
    void listSingersForSong({ data: song.id })
      .then(setSingers)
      .catch(() => setSingers({ total: 0, singers: [] }));
  };

  useEffect(() => {
    loadSingers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song.id]);

  useEffect(() => {
    if (!user) {
      setMark(null);
      return;
    }
    void whichSingableOn({ data: { ids: [song.id], targetSoulId: soulId || undefined } })
      .then((rows) => setMark(rows[0] ?? null))
      .catch(() => setMark(null));
  }, [user, song.id, soulId]);
  return (
    <article className="space-y-4">
      <ListTargetBar />
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
          管理番号 {songCode(song)}
          {song.arrangement ? ` · ${song.arrangement}` : ""}
        </p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          {song.title}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{song.artist}</p>
        <div className="mt-3">
          <CanSingButton
            songId={song.id}
            marked={Boolean(mark)}
            source={mark?.source ?? "self"}
            canRevoke={Boolean(mark?.canRevoke)}
            onChange={(on, info) => {
              setMark(
                on
                  ? {
                      songId: song.id,
                      source: info?.source ?? (soulId ? "proxy" : "self"),
                      canRevoke: info?.canRevoke ?? Boolean(soulId),
                    }
                  : null,
              );
              loadSingers();
            }}
          />
        </div>
        {(song.titleKana || song.artistKana) && (
          <p className="mt-1 text-[12px] text-muted-foreground">
            {song.titleKana || "—"} / {song.artistKana || "—"}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
          <span className="rounded-full border border-border bg-muted/40 px-2.5 py-1">
            {genreLabel(song.genre)}
          </span>
          {song.keyNote && (
            <span className="rounded-full border border-border bg-muted/40 px-2.5 py-1">
              原曲キー {song.keyNote}
            </span>
          )}
          {vocalMetaLabel(song) && (
            <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1">
              {vocalMetaLabel(song)}
            </span>
          )}
          {song.tieup && (
            <span className="rounded-full border border-border bg-muted/40 px-2.5 py-1">
              {song.tieup}
            </span>
          )}
          {song.platforms.map((id) => (
            <span
              key={id}
              className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1"
            >
              {platformLabel(id)}
            </span>
          ))}
        </div>
      </section>

      <VocalSection
        song={song}
        canEdit={Boolean(
          admin || (user && (!song.createdBy || song.createdBy === user.id)),
        )}
        onSaved={setSong}
      />

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Mic2 className="size-4 text-primary" />
          歌える人
          <span className="font-normal tabular-nums text-muted-foreground">
            {singers.total} 人
          </span>
        </h3>
        {singers.singers.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-border bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
            まだいません。「これ歌える」を押すとここに載ります。
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border">
            {singers.singers.map((p, i) => {
              const name = p.displayName || p.soulId || "歌い手";
              const inner = (
                <>
                  {p.avatarUrl ? (
                    <img
                      src={p.avatarUrl}
                      alt=""
                      className="size-9 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                      {name.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {name}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {p.rangeMinNote && p.rangeMaxNote
                        ? `声域 ${p.rangeMinNote} 〜 ${p.rangeMaxNote}`
                        : p.soulId
                          ? `/c/${p.soulId}`
                          : "プロフィール"}
                    </span>
                  </span>
                </>
              );
              return (
                <li key={`${p.soulId || name}-${i}`}>
                  {p.soulId ? (
                    <Link
                      to="/c/$soulId"
                      params={{ soulId: p.soulId }}
                      className="flex items-center gap-3 px-3 py-2.5 transition-colors duration-150 hover:bg-muted/40"
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 px-3 py-2.5">{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {singers.total > singers.singers.length && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            公開プロフィールがある人だけ表示しています（全 {singers.total} 人）
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground">原曲</h3>
        {original ? (
          <p className="mt-2 text-sm">
            <Link
              to="/songdb/$code"
              params={{ code: songCode(original) }}
              className="font-semibold text-primary underline-offset-2 hover:underline"
            >
              {original.title}
            </Link>
            <span className="text-muted-foreground">
              {" "}
              / {original.artist} · {songCode(original)}
            </span>
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            この曲が原曲です。アレンジを何件でも紐づけられます。
          </p>
        )}
        {rootCode && (
          <Button asChild size="sm" className="mt-3">
            <Link to="/songdb" search={{ arrange: rootCode }}>
              <Plus className="size-3.5" />
              この原曲のアレンジを登録
            </Link>
          </Button>
        )}
      </section>

      {rootCode ? (
        <ArrangementList originalCode={rootCode} excludeId={song.id} totalHint={payload.arrangementTotal} />
      ) : null}

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground">クレジット</h3>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[11px] text-muted-foreground">作詞</dt>
            <dd>{song.lyricist || "—"}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-muted-foreground">作曲</dt>
            <dd>{song.composer || "—"}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-muted-foreground">よみ（曲）</dt>
            <dd>{song.titleKana || "—"}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-muted-foreground">よみ（歌手）</dt>
            <dd>{song.artistKana || "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground">歌詞・歌い出し</h3>
        {song.lyrics ? (
          <p className="mt-3 whitespace-pre-wrap rounded-2xl border border-border bg-muted/20 px-4 py-3 text-sm leading-relaxed text-foreground">
            {song.lyrics}
          </p>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">歌詞はまだ入っていません。</p>
        )}
      </section>

      {song.youtubeUrl && (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <a
            href={song.youtubeUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-primary underline-offset-2 hover:underline"
          >
            YouTube で見る
          </a>
        </section>
      )}

      <SongListenLinks songId={song.id} />

      <Button asChild variant="secondary">
        <Link to="/songdb">
          <ListMusic className="size-3.5" />
          楽曲リストへ戻る
        </Link>
      </Button>
    </article>
  );
}

function VocalSection({
  song,
  canEdit,
  onSaved,
}: {
  song: Song;
  canEdit: boolean;
  onSaved: (song: Song) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [min, setMin] = useState(song.vocalMinNote);
  const [max, setMax] = useState(song.vocalMaxNote);
  const [bpm, setBpm] = useState(song.bpm);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const range = vocalRangeText(song);

  useEffect(() => {
    setMin(song.vocalMinNote);
    setMax(song.vocalMaxNote);
    setBpm(song.bpm);
  }, [song.id, song.vocalMinNote, song.vocalMaxNote, song.bpm]);

  const save = () => {
    setBusy(true);
    setErr("");
    void saveSongVocal({
      data: { id: song.id, vocalMinNote: min, vocalMaxNote: max, bpm },
    })
      .then((res) => {
        if (res.song) onSaved(res.song);
        setEditing(false);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "保存できませんでした"))
      .finally(() => setBusy(false));
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Music2 className="size-4 text-primary" />
          声域
        </h3>
        {canEdit && !editing && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setEditing(true)}
          >
            {range || song.bpm > 0 ? "直す" : "入れる"}
          </Button>
        )}
      </div>
      {!editing ? (
        range || song.bpm > 0 ? (
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-[11px] text-muted-foreground">最低</dt>
              <dd className="font-medium">{song.vocalMinNote || "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted-foreground">最高</dt>
              <dd className="font-medium">{song.vocalMaxNote || "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted-foreground">BPM</dt>
              <dd className="font-medium">{song.bpm > 0 ? song.bpm : "—"}</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            まだ入っていません。メロディの最低〜最高とテンポを残せます。
          </p>
        )
      ) : (
        <div className="mt-3">
          <SongVocalFields
            vocalMinNote={min}
            vocalMaxNote={max}
            bpm={bpm}
            onChange={(next) => {
              if (next.vocalMinNote != null) setMin(next.vocalMinNote);
              if (next.vocalMaxNote != null) setMax(next.vocalMaxNote);
              if (next.bpm != null) setBpm(next.bpm);
            }}
          />
          {err && <p className="mt-2 text-[11px] text-danger">{err}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={busy} onClick={save}>
              {busy ? "保存中…" : "保存する"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setMin(song.vocalMinNote);
                setMax(song.vocalMaxNote);
                setBpm(song.bpm);
                setErr("");
              }}
            >
              やめる
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function ArrangementList({
  originalCode,
  excludeId,
  totalHint,
}: {
  originalCode: string;
  excludeId: string;
  totalHint: number;
}) {
  const [q, setQ] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [page, setPage] = useState(1);
  const [songs, setSongs] = useState<Song[]>([]);
  const [total, setTotal] = useState(totalHint);
  const [busy, setBusy] = useState(false);
  const pageSize = 20;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const load = (next: { q?: string; page?: number } = {}) => {
    const query = next.q ?? submitted;
    const p = next.page ?? page;
    setBusy(true);
    void listArrangements({
      data: { originalCode, q: query, page: p, pageSize, excludeId },
    })
      .then((res) => {
        setSongs(res.songs);
        setTotal(res.total);
        setPage(res.page);
      })
      .catch(() => {
        setSongs([]);
        setTotal(0);
      })
      .finally(() => setBusy(false));
  };

  useEffect(() => {
    load({ page: 1, q: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originalCode, excludeId]);

  if (total === 0 && !submitted && !busy) return null;

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-foreground">
        アレンジ {total} 件
      </h3>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(q.trim());
          load({ q: q.trim(), page: 1 });
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="アレンジ名・曲名・管理番号"
          className="h-9 min-w-0 flex-1 rounded-full border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button type="submit" size="sm" variant="secondary" disabled={busy}>
          <Search className="size-3.5" />
          検索
        </Button>
      </form>
      {songs.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {busy ? "読み込み中…" : "見つかりませんでした"}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
          {songs.map((a) => (
            <li key={a.id}>
              <Link
                to="/songdb/$code"
                params={{ code: songCode(a) }}
                className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-muted/40"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {a.title}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {a.artist}
                    {a.arrangement ? ` · ${a.arrangement}` : ""}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                  {songCode(a)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-center gap-2">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            disabled={page <= 1 || busy}
            onClick={() => load({ page: page - 1 })}
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
            onClick={() => load({ page: page + 1 })}
            aria-label="次のページ"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}
    </section>
  );
}
