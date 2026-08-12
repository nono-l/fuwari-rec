import { useEffect, useState } from "react";
import { ExternalLink, Link2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { extractYouTubeId } from "@/lib/youtube";
import {
  destroyYouTubePlayer,
  mountYouTubePlayer,
} from "@/lib/youtube-player";
import { useEditorStore } from "@/lib/store/editor-store";
import { cn } from "@/lib/utils";

const PLAYER_ELEMENT_ID = "fuwari-yt-player";

export function YoutubePanel() {
  const youtubeVideoId = useEditorStore((s) => s.youtubeVideoId);
  const youtubeInput = useEditorStore((s) => s.youtubeInput);
  const youtubeSync = useEditorStore((s) => s.youtubeSync);
  const youtubeReady = useEditorStore((s) => s.youtubeReady);
  const youtubePlayerEpoch = useEditorStore((s) => s.youtubePlayerEpoch);
  const setYoutubeInput = useEditorStore((s) => s.setYoutubeInput);
  const loadYoutube = useEditorStore((s) => s.loadYoutube);
  const clearYoutube = useEditorStore((s) => s.clearYoutube);
  const setYoutubeReady = useEditorStore((s) => s.setYoutubeReady);
  const setYoutubeSync = useEditorStore((s) => s.setYoutubeSync);
  const play = useEditorStore((s) => s.play);
  const [error, setError] = useState<string | null>(null);
  const [mounting, setMounting] = useState(false);

  // Mount / remount official YT.Player when video id changes
  useEffect(() => {
    if (!youtubeVideoId) {
      destroyYouTubePlayer();
      setYoutubeReady(false);
      return;
    }

    let cancelled = false;
    setMounting(true);
    setYoutubeReady(false);

    void (async () => {
      try {
        // Ensure the host node exists for this epoch
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        if (cancelled) return;
        const el = document.getElementById(PLAYER_ELEMENT_ID);
        if (!el) {
          setError("プレイヤー領域を初期化できませんでした");
          return;
        }
        await mountYouTubePlayer(PLAYER_ELEMENT_ID, youtubeVideoId);
        if (cancelled) return;
        setYoutubeReady(true);
        setError(null);
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setError("YouTube プレイヤーの読み込みに失敗しました");
          setYoutubeReady(false);
        }
      } finally {
        if (!cancelled) setMounting(false);
      }
    })();

    return () => {
      cancelled = true;
      destroyYouTubePlayer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- epoch forces remount
  }, [youtubeVideoId, youtubePlayerEpoch]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = extractYouTubeId(youtubeInput);
    if (!id) {
      setError("有効な YouTube URL または動画 ID を入力してください");
      return;
    }
    setError(null);
    loadYoutube(id);
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            YouTube 連携
          </h2>
          <p className="mt-0.5 max-w-xl text-[11px] leading-relaxed text-muted-foreground">
            公式 API で上部の再生 / 停止 / 録音と連動します。音声の抽出・書き出しには含めません。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-[11px] font-medium text-foreground">
            <input
              type="checkbox"
              className="size-3.5 accent-[var(--color-primary)]"
              checked={youtubeSync}
              onChange={(e) => setYoutubeSync(e.target.checked)}
            />
            再生ボタンと同期
          </label>
          {youtubeVideoId && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={clearYoutube}
            >
              <X className="size-3.5" />
              閉じる
            </Button>
          )}
        </div>
      </div>

      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-2 sm:flex-row sm:items-center"
      >
        <div className="relative min-w-0 flex-1">
          <Link2 className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="url"
            inputMode="url"
            placeholder="https://www.youtube.com/watch?v=… または動画 ID"
            value={youtubeInput}
            onChange={(e) => {
              setYoutubeInput(e.target.value);
              if (error) setError(null);
            }}
            className={cn(
              "h-10 w-full rounded-full border border-border bg-background pr-3 pl-10 text-sm text-foreground outline-none transition-colors",
              "placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring",
            )}
            aria-label="YouTube URL"
          />
        </div>
        <Button type="submit" size="default" className="shrink-0" disabled={mounting}>
          {mounting ? "読み込み中…" : "読み込む"}
        </Button>
        {youtubeReady && (
          <Button
            type="button"
            size="default"
            variant="secondary"
            className="shrink-0"
            onClick={() => play()}
          >
            同期再生
          </Button>
        )}
      </form>

      {error && (
        <p className="mt-2 text-xs text-danger" role="alert">
          {error}
        </p>
      )}

      {youtubeVideoId ? (
        <div className="mt-3 overflow-hidden rounded-xl border border-border bg-muted/40">
          <div className="relative aspect-video w-full bg-foreground/5">
            {/* YT.Player replaces this node with an iframe */}
            <div
              key={`${youtubeVideoId}-${youtubePlayerEpoch}`}
              id={PLAYER_ELEMENT_ID}
              className="absolute inset-0 h-full w-full"
            />
            {(mounting || !youtubeReady) && (
              <div className="absolute inset-0 grid place-items-center bg-background/60 text-xs text-muted-foreground">
                YouTube を準備中…
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[11px] text-muted-foreground">
            <span>
              {youtubeReady
                ? youtubeSync
                  ? "上部の再生ボタンと連動中"
                  : "同期オフ（プレイヤー単体操作）"
                : "接続中…"}
            </span>
            <a
              href={`https://www.youtube.com/watch?v=${youtubeVideoId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-foreground hover:underline"
            >
              YouTube で開く
              <ExternalLink className="size-3" />
            </a>
          </div>
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-xs text-muted-foreground">
          URL を読み込むと、スタジオの再生 / 一時停止 / 停止 / 録音が YouTube と連動します。
        </div>
      )}
    </section>
  );
}
