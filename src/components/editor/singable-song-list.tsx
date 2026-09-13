import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, ListMusic, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SongRowSkeleton } from "@/components/ui/skeleton";
import { listMySingable, listPublicSingable, type SingablePage } from "@/lib/profile/singable";
import { unmarkSingableOn } from "@/lib/profile/list-ops";
import { vocalMetaLabel } from "@/lib/songdb/types";

export function SingableSongList({
  mode,
  soulId = "",
  canUnmark = false,
}: {
  mode: "mine" | "public";
  soulId?: string;
  canUnmark?: boolean;
}) {
  const [q, setQ] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<SingablePage>({
    songs: [],
    total: 0,
    page: 1,
    pageSize: 20,
  });
  const [busy, setBusy] = useState(true);
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));

  const load = (next: { q?: string; page?: number } = {}) => {
    const query = next.q ?? submitted;
    const p = next.page ?? page;
    setBusy(true);
    const run =
      mode === "mine"
        ? listMySingable({ data: { q: query, page: p, pageSize: 20 } })
        : listPublicSingable({
            data: { soulId, q: query, page: p, pageSize: 20 },
          });
    void run
      .then((res) => {
        setData(res);
        setPage(res.page);
      })
      .catch(() =>
        setData({ songs: [], total: 0, page: 1, pageSize: 20 }),
      )
      .finally(() => setBusy(false));
  };

  useEffect(() => {
    load({ page: 1, q: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, soulId]);

  return (
    <div>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(q.trim());
          load({ q: q.trim(), page: 1 });
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="曲名・歌手・管理番号"
          className="h-9 min-w-0 flex-1 rounded-full border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button type="submit" size="sm" variant="secondary" disabled={busy}>
          <Search className="size-3.5" />
          検索
        </Button>
      </form>
      {busy && data.songs.length === 0 ? (
        <div className="mt-3 overflow-hidden rounded-xl border border-border">
          <SongRowSkeleton rows={4} />
        </div>
      ) : data.songs.length === 0 ? (
        <EmptyState
          icon={ListMusic}
          title={submitted ? "見つかりませんでした" : "まだありません"}
          description={
            submitted
              ? "曲名・歌手・管理番号を変えてみてください。"
              : canUnmark
                ? "楽曲リストで「これ歌える」を押すと、ここに載ります。"
                : "公開されている歌える曲はまだありません。"
          }
          className="py-8"
        />
      ) : (
        <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border">
          {data.songs.map((s) => (
            <li key={s.id} className="flex items-center gap-2 bg-muted/20 px-3 py-2 transition-colors duration-150 hover:bg-muted/45">
              <Link
                to="/songdb/$code"
                params={{ code: s.mgmtNo || s.id }}
                className="min-w-0 flex-1"
              >
                <span className="block truncate text-xs font-medium text-foreground sm:text-sm">
                  {s.title}
                </span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {s.artist}
                  {s.mgmtNo ? ` · ${s.mgmtNo}` : ""}
                  {s.keyNote ? ` · キー ${s.keyNote}` : ""}
                  {vocalMetaLabel(s) ? ` · ${vocalMetaLabel(s)}` : ""}
                </span>
              </Link>
              {canUnmark && s.source === "proxy" && (
                <span className="shrink-0 rounded-full border border-amber-600/40 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                  運営が追加
                  {s.addedByName ? ` · ${s.addedByName}` : ""}
                  {s.markedAt ? ` · ${s.markedAt.replace("T", " ").slice(0, 16)}` : ""}
                </span>
              )}
              {canUnmark && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    void unmarkSingableOn({ data: { songId: s.id } })
                      .then(() => load())
                      .finally(() => setBusy(false));
                  }}
                >
                  外す
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] tabular-nums text-muted-foreground">
        {data.total} 曲
        {pages > 1 ? ` · ${data.page} / ${pages}` : ""}
      </p>
      {pages > 1 && (
        <div className="mt-1 flex items-center justify-center gap-2">
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
    </div>
  );
}
