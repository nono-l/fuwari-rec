import { useEffect, useRef, useState } from "react";
import {
  ClipboardPaste,
  ExternalLink,
  Link2,
  MicOff,
  Music2,
  Plus,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { extractYouTubeId } from "@/lib/youtube";
import { useEditorStore } from "@/lib/store/editor-store";
import { MEDIA_FILE_ACCEPT } from "@/lib/audio/media-decode";
import { MAX_YOUTUBE_CLIPS } from "@/lib/youtube-clips";
import { cn } from "@/lib/utils";

/** Keep the sheet above the software keyboard (iOS visualViewport). */
function useKeyboardInset(active: boolean) {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    if (!active || typeof window === "undefined") {
      setInset(0);
      return;
    }
    const vv = window.visualViewport;
    const sync = () => {
      if (!vv) {
        setInset(0);
        return;
      }
      const overlap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setInset(overlap);
    };
    sync();
    vv?.addEventListener("resize", sync);
    vv?.addEventListener("scroll", sync);
    window.addEventListener("focusin", sync);
    return () => {
      vv?.removeEventListener("resize", sync);
      vv?.removeEventListener("scroll", sync);
      window.removeEventListener("focusin", sync);
    };
  }, [active]);
  return inset;
}

function YoutubeLoadSheet({
  open,
  onClose,
  canAdd,
  onLoad,
}: {
  open: boolean;
  onClose: () => void;
  canAdd: boolean;
  onLoad: (videoId: string, source: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pasteHint, setPasteHint] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const keyboardInset = useKeyboardInset(open);

  useEffect(() => {
    if (!open) return;
    setDraft("");
    setError(null);
    setPasteHint(null);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => inputRef.current?.focus(), 40);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = extractYouTubeId(draft);
    if (!id) {
      setError("有効な YouTube URL または動画 ID を入力してください");
      return;
    }
    if (!canAdd) {
      setError(`YouTube は ${MAX_YOUTUBE_CLIPS} 本までです`);
      return;
    }
    onLoad(id, draft.trim());
    onClose();
  };

  const paste = async () => {
    setPasteHint(null);
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) {
        setPasteHint("クリップボードは空です。入力欄を長押ししても貼れます");
        inputRef.current?.focus();
        return;
      }
      setDraft(text);
      setError(null);
      inputRef.current?.focus();
    } catch {
      setPasteHint("入力欄を長押しして貼り付けてください");
      inputRef.current?.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/45 sm:items-center"
      style={{ paddingBottom: keyboardInset }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="yt-load-title"
        className="w-full max-w-lg rounded-t-3xl border border-border bg-card p-4 shadow-lg sm:rounded-2xl sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h2
              id="yt-load-title"
              className="text-base font-semibold text-foreground"
            >
              YouTube を読み込む
            </h2>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
              キーボードの上で入力できます。YouTube アプリからコピーして貼り付けても大丈夫です。
            </p>
          </div>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={onClose}
            aria-label="閉じる"
          >
            <X className="size-4" />
          </Button>
        </div>

        <label className="block text-[11px] font-medium text-muted-foreground">
          URL または動画 ID
          <span className="relative mt-1.5 block">
            <Link2 className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              inputMode="url"
              enterKeyHint="go"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              placeholder="youtube.com/watch?v=…  /  youtu.be/…"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (error) setError(null);
              }}
              className={cn(
                "h-12 w-full rounded-2xl border border-border bg-background pr-3 pl-11 text-base text-foreground outline-none",
                "placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring",
              )}
              aria-label="YouTube URL または動画 ID"
            />
          </span>
        </label>

        {error && (
          <p className="mt-2 text-xs text-danger" role="alert">
            {error}
          </p>
        )}
        {pasteHint && !error && (
          <p className="mt-2 text-[11px] text-muted-foreground">{pasteHint}</p>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="secondary"
            className="h-12 rounded-2xl"
            onClick={() => void paste()}
          >
            <ClipboardPaste className="size-4" />
            貼り付け
          </Button>
          <Button type="submit" className="h-12 rounded-2xl" disabled={!canAdd}>
            <Plus className="size-4" />
            読み込む
          </Button>
        </div>
      </form>
    </div>
  );
}

export function YoutubePanel() {
  const youtubeSync = useEditorStore((s) => s.youtubeSync);
  const youtubeReady = useEditorStore((s) => s.youtubeReady);
  const youtubeClips = useEditorStore((s) => s.youtubeClips);
  const loadYoutube = useEditorStore((s) => s.loadYoutube);
  const clearYoutube = useEditorStore((s) => s.clearYoutube);
  const removeYoutubeClip = useEditorStore((s) => s.removeYoutubeClip);
  const setYoutubeSync = useEditorStore((s) => s.setYoutubeSync);
  const setYoutubeClipSync = useEditorStore((s) => s.setYoutubeClipSync);
  const setYoutubeClipMuted = useEditorStore((s) => s.setYoutubeClipMuted);
  const play = useEditorStore((s) => s.play);
  const loadFileForYoutubeCancel = useEditorStore(
    (s) => s.loadFileForYoutubeCancel,
  );
  const youtubeMuteForCancel = useEditorStore((s) => s.youtubeMuteForCancel);
  const isSeparating = useEditorStore((s) => s.isSeparating);
  const isLoadingMedia = useEditorStore((s) => s.isLoadingMedia);
  const [sheetOpen, setSheetOpen] = useState(false);

  const canAdd = youtubeClips.length < MAX_YOUTUBE_CLIPS;

  const pickForCancel = (mode: "remove-vocals" | "remove-instrumental") => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = MEDIA_FILE_ACCEPT;
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) void loadFileForYoutubeCancel(file, mode);
    };
    input.click();
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            YouTube 連携
          </h2>
          <p className="mt-0.5 max-w-xl text-[11px] leading-relaxed text-muted-foreground">
            最大 {MAX_YOUTUBE_CLIPS} 本まで同時再生。📍 でピン留め、ピンチまたは右下ドラッグで拡大縮小。
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
          {youtubeClips.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={clearYoutube}
            >
              <X className="size-3.5" />
              全部閉じる
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="button"
          disabled={!canAdd}
          onClick={() => setSheetOpen(true)}
          className={cn(
            "relative h-11 min-w-0 flex-1 rounded-full border border-border bg-background pr-3 pl-10 text-left text-sm outline-none",
            "transition-colors focus-visible:ring-2 focus-visible:ring-ring",
            canAdd
              ? "text-muted-foreground hover:border-primary/40 hover:text-foreground"
              : "cursor-not-allowed opacity-50",
          )}
          aria-label="YouTube URL を入力して読み込む"
        >
          <Link2 className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          URL または動画 ID を入力…
        </button>
        <Button
          type="button"
          size="default"
          className="shrink-0"
          disabled={!canAdd}
          onClick={() => setSheetOpen(true)}
        >
          <Plus className="size-4" />
          {youtubeClips.length === 0 ? "読み込む" : "追加"}
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
      </div>
      <p className="mt-1.5 text-[10px] text-muted-foreground">
        {youtubeClips.length}/{MAX_YOUTUBE_CLIPS} 本
        {!canAdd && " · 上限です。どれかを閉じてから追加できます"}
        {canAdd && " · スマホは読み込み画面でキーボードの上に入力できます"}
      </p>

      {youtubeClips.length > 0 ? (
        <div
          className={cn(
            "mt-3 grid gap-3",
            youtubeClips.length > 1 ? "sm:grid-cols-2" : "grid-cols-1",
          )}
        >
          {youtubeClips.map((clip, i) => (
            <div
              key={clip.id}
              className="overflow-hidden rounded-xl border border-border bg-muted/40"
            >
              <div className="h-9 border-b border-transparent" aria-hidden />
              <div
                data-yt-dock-slot={clip.id}
                className="relative aspect-video w-full bg-foreground/5"
              >
                {clip.pinned && (
                  <div className="absolute inset-0 grid place-items-center px-4 text-center text-xs text-muted-foreground">
                    ピン留め中。📍 で戻す。ピンチ／右下でサイズ。
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[11px] text-muted-foreground">
                <span>
                  {i + 1}.{" "}
                  {clip.ready
                    ? clip.sync
                      ? "再生ボタンと連動"
                      : "単体操作"
                    : "接続中…"}
                  {youtubeMuteForCancel && clip.sync ? " · 音はファイル" : ""}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className={cn(
                      "rounded-full px-2 py-0.5",
                      clip.sync
                        ? "bg-primary/10 text-foreground"
                        : "hover:bg-background",
                    )}
                    onClick={() => setYoutubeClipSync(clip.id, !clip.sync)}
                  >
                    {clip.sync ? "同期" : "非同期"}
                  </button>
                  <button
                    type="button"
                    className="rounded-full p-1 hover:bg-background"
                    aria-label={clip.muted ? "ミュート解除" : "ミュート"}
                    onClick={() => setYoutubeClipMuted(clip.id, !clip.muted)}
                  >
                    {clip.muted ? (
                      <VolumeX className="size-3.5" />
                    ) : (
                      <Volume2 className="size-3.5" />
                    )}
                  </button>
                  <a
                    href={`https://www.youtube.com/watch?v=${clip.videoId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-foreground hover:underline"
                  >
                    開く
                    <ExternalLink className="size-3" />
                  </a>
                  <button
                    type="button"
                    className="rounded-full p-1 hover:bg-background"
                    aria-label="閉じる"
                    onClick={() => removeYoutubeClip(clip.id)}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-xs text-muted-foreground">
          URL を読み込むと、スタジオの再生 / 一時停止 / 停止 / 録音と連動します。2本目以降も追加できます。
        </div>
      )}

      {youtubeClips.length > 0 && (
        <div className="mt-3 rounded-xl border border-border bg-muted/30 p-3">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            ブラウザは YouTube 本体の音を直接加工できません。同じ曲の音声／動画ファイルを読むと、
            映像は YouTube、音はキャンセルしたファイルで同期再生できます。
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant="secondary"
              className="h-auto justify-start gap-2 rounded-xl px-3 py-2.5 text-left"
              disabled={isSeparating || isLoadingMedia}
              onClick={() => pickForCancel("remove-vocals")}
            >
              <MicOff className="size-4 shrink-0 text-primary" />
              <span>
                <span className="block text-xs font-medium text-foreground">
                  ファイルでボーカルキャンセル
                </span>
                <span className="block text-[10px] text-muted-foreground">
                  カラオケ寄りで映像に合わせる
                </span>
              </span>
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="h-auto justify-start gap-2 rounded-xl px-3 py-2.5 text-left"
              disabled={isSeparating || isLoadingMedia}
              onClick={() => pickForCancel("remove-instrumental")}
            >
              <Music2 className="size-4 shrink-0 text-primary" />
              <span>
                <span className="block text-xs font-medium text-foreground">
                  ファイルで音源キャンセル
                </span>
                <span className="block text-[10px] text-muted-foreground">
                  中央の声寄りを残す
                </span>
              </span>
            </Button>
          </div>
        </div>
      )}

      <YoutubeLoadSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        canAdd={canAdd}
        onLoad={(id, source) => loadYoutube(id, source)}
      />
    </section>
  );
}
