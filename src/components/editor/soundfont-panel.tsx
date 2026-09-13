import { useEffect, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  activateSoundfont,
  downloadSoundfont,
  getSoundfontState,
  hydrateSoundfont,
  loadSoundfontFile,
  removeSoundfont,
  subscribeSoundfont,
} from "@/lib/audio/soundfont/engine";
import { SOUNDFONT_CATALOG, formatBytes } from "@/lib/audio/soundfont/catalog";
import { useEditorStore } from "@/lib/store/editor-store";

export function SoundfontPanel() {
  const sf = useSyncExternalStore(subscribeSoundfont, getSoundfontState, getSoundfontState);
  const rebakeMidiTracks = useEditorStore((s) => s.rebakeMidiTracks);
  const converting = useEditorStore((s) => s.isConvertingMidi);

  useEffect(() => {
    void hydrateSoundfont();
  }, []);

  const afterChange = () => {
    void rebakeMidiTracks();
  };

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3">
      <div className="text-xs font-medium text-foreground">SoundFont（任意）</div>
      <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
        ダウンロード済みなら FluidSynth（WASM）で鳴らします。なければ今までの内蔵シンセです。
      </p>

      <div className="mt-2 space-y-1.5">
        <button
          type="button"
          disabled={sf.busy || converting}
          onClick={() => {
            void activateSoundfont(null).then(afterChange);
          }}
          className={cn(
            "flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 text-left text-[11px]",
            !sf.ready
              ? "border-primary bg-primary/10 text-foreground"
              : "border-border bg-background text-muted-foreground hover:text-foreground",
          )}
        >
          <span>内蔵シンセ</span>
          <span>ダウンロード不要</span>
        </button>
        {SOUNDFONT_CATALOG.map((font) => {
          const have = sf.downloadedIds.includes(font.id);
          const on = sf.activeId === font.id;
          return (
            <div
              key={font.id}
              className={cn(
                "flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-1.5",
                on
                  ? "border-primary bg-primary/10"
                  : "border-border bg-background",
              )}
            >
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                disabled={sf.busy || converting}
                onClick={() => {
                  if (have) void activateSoundfont(font.id).then(afterChange);
                  else if (!font.localOnly) {
                    void downloadSoundfont(font.id).then(afterChange).catch(() => undefined);
                  }
                }}
              >
                <span className="block text-[11px] font-medium text-foreground">
                  {font.label}
                </span>
                <span className="block text-[10px] text-muted-foreground">
                  {font.hint}
                </span>
              </button>
              {have ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant={on ? "default" : "secondary"}
                    disabled={sf.busy || converting}
                    onClick={() => void activateSoundfont(on ? null : font.id).then(afterChange)}
                  >
                    {on ? "使用中" : "使う"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={sf.busy}
                    onClick={() => void removeSoundfont(font.id).then(afterChange)}
                  >
                    削除
                  </Button>
                </>
              ) : font.localOnly ? (
                <span className="text-[10px] text-muted-foreground">ファイル指定</span>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  disabled={sf.busy || converting}
                  onClick={() =>
                    void downloadSoundfont(font.id).then(afterChange).catch(() => undefined)
                  }
                >
                  入手 {formatBytes(font.bytes)}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {sf.busy && (
        <p className="mt-2 text-[10px] text-muted-foreground">
          {sf.progress > 0
            ? `読み込み ${Math.round(sf.progress * 100)}%`
            : "準備中…"}
        </p>
      )}
      {sf.error && (
        <p className="mt-2 text-[10px] text-danger">
          {sf.error} · 下からファイル指定もできます
        </p>
      )}

      <label className="mt-2 block text-[10px] text-muted-foreground">
        持っている .sf2 を使う
        <input
          type="file"
          accept=".sf2,.sf3,audio/x-soundfont"
          className="mt-1 block w-full text-[11px] text-foreground file:mr-2 file:rounded-full file:border-0 file:bg-primary file:px-3 file:py-1 file:text-[11px] file:text-primary-foreground"
          disabled={sf.busy || converting}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void loadSoundfontFile(f).then(afterChange).catch(() => undefined);
          }}
        />
      </label>
      {sf.ready && (
        <p className="mt-2 text-[10px] text-foreground">
          使用中: {sf.label} · FluidSynth WASM
        </p>
      )}
    </div>
  );
}
