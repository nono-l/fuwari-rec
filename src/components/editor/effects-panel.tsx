import { MIX_PRESETS } from "@/lib/audio/types";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/lib/store/editor-store";
import {
  AudioLines,
  Power,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Speaker,
  Trash2,
} from "lucide-react";

export function EffectsPanel({
  layout = "page",
}: {
  layout?: "page" | "compact";
}) {
  const master = useEditorStore((s) => s.master);
  const setMaster = useEditorStore((s) => s.setMaster);
  const applyPreset = useEditorStore((s) => s.applyPreset);
  const liveFxActive = useEditorStore((s) => s.liveFxActive);
  const liveFxBusy = useEditorStore((s) => s.liveFxBusy);
  const liveLevel = useEditorStore((s) => s.liveLevel);
  const inputEnabled = useEditorStore((s) => s.inputEnabled);
  const outputEnabled = useEditorStore((s) => s.outputEnabled);
  const toggleLiveFx = useEditorStore((s) => s.toggleLiveFx);
  const roomProfile = useEditorStore((s) => s.roomProfile);
  const roomAmount = useEditorStore((s) => s.roomAmount);
  const roomCapturing = useEditorStore((s) => s.roomCapturing);
  const roomCaptureProgress = useEditorStore((s) => s.roomCaptureProgress);
  const captureRoomProfile = useEditorStore((s) => s.captureRoomProfile);
  const clearRoomProfile = useEditorStore((s) => s.clearRoomProfile);
  const setRoomAmount = useEditorStore((s) => s.setRoomAmount);

  const resetFx = () => {
    applyPreset("original");
    setMaster({ volume: 1 });
  };

  const isPage = layout === "page";
  const levelPct = Math.min(100, Math.round(liveLevel * 140));

  return (
    <div className={cn("flex flex-col gap-4", isPage && "gap-5")}>
      {/* Live effector hero */}
      <section
        className={cn(
          "overflow-hidden rounded-2xl border shadow-sm",
          liveFxActive
            ? "border-primary bg-primary/8"
            : "border-border bg-card",
          isPage ? "p-4 sm:p-6" : "p-4",
        )}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                  liveFxActive
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    liveFxActive
                      ? "animate-pulse bg-primary-foreground"
                      : "bg-muted-foreground/50",
                  )}
                />
                {liveFxActive ? "LIVE" : "STANDBY"}
              </span>
              <h2 className="flex items-center gap-2 text-base font-semibold text-foreground sm:text-lg">
                <AudioLines className="size-5 text-primary" />
                ライブエフェクター
              </h2>
            </div>
            <p className="mt-1.5 max-w-xl text-xs leading-relaxed text-muted-foreground sm:text-sm">
              録音しなくても使えます。ブラウザを開いたままマイクの声をリアルタイム加工。
              プリセットとスライダーはそのまま耳に届きます。ノイズ抑えは部屋のサー向けです。
            </p>
          </div>

          <Button
            type="button"
            size="lg"
            variant={liveFxActive ? "danger" : "default"}
            disabled={liveFxBusy || !inputEnabled}
            onClick={() => void toggleLiveFx()}
            className="min-w-[10.5rem] shrink-0"
            aria-pressed={liveFxActive}
          >
            <Power className="size-4" />
            {liveFxBusy
              ? "接続中…"
              : liveFxActive
                ? "エフェクト OFF"
                : "エフェクト ON"}
          </Button>
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>入力レベル</span>
            <span className="tabular-nums text-foreground">
              {liveFxActive ? `${levelPct}%` : "—"}
            </span>
          </div>
          <div
            className="h-2.5 overflow-hidden rounded-full bg-muted"
            role="meter"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={liveFxActive ? levelPct : 0}
            aria-label="ライブ入力レベル"
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-75",
                levelPct > 85 ? "bg-danger" : "bg-primary",
              )}
              style={{ width: liveFxActive ? `${levelPct}%` : "0%" }}
            />
          </div>
          {!inputEnabled && (
            <p className="text-[11px] text-danger">
              入力がオフです。スタジオのデバイスパネルでオンにしてください。
            </p>
          )}
          {!outputEnabled && liveFxActive && (
            <p className="text-[11px] text-danger">
              出力がオフのため音は聞こえません。出力をオンにしてください。
            </p>
          )}
        </div>
      </section>

      <section
        className={cn(
          "rounded-2xl border border-border bg-card shadow-sm",
          isPage ? "p-4 sm:p-6" : "p-4",
        )}
      >
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2 sm:mb-4">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground sm:text-base">
              <Sparkles className="size-4 text-primary" />
              MIX プリセット
            </h2>
            <p className="mt-1 text-[11px] text-muted-foreground sm:text-xs">
              ライブ中でも即反映。声の雰囲気をワンタップで切り替え。
            </p>
          </div>
          <Button type="button" size="sm" variant="secondary" onClick={resetFx}>
            <RotateCcw className="size-3.5" />
            リセット
          </Button>
        </div>
        <div
          className={cn(
            "grid gap-2",
            isPage
              ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
              : "grid-cols-2",
          )}
        >
          {MIX_PRESETS.map((p) => {
            const active = master.preset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id)}
                className={cn(
                  "rounded-xl border px-3 py-3 text-left transition-colors duration-150",
                  active
                    ? "border-primary bg-primary/10 text-foreground shadow-sm"
                    : "border-border bg-muted/40 text-muted-foreground hover:border-border-strong hover:text-foreground",
                )}
              >
                <div className="text-sm font-semibold">{p.label}</div>
                <div className="mt-1 text-[11px] leading-snug opacity-80">
                  {p.description}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section
        className={cn(
          "rounded-2xl border border-border bg-card shadow-sm",
          isPage ? "p-4 sm:p-6" : "p-4",
        )}
      >
        <div className="mb-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground sm:text-base">
            <Speaker className="size-4 text-primary" />
            部屋／テレビを覚える
          </h2>
          <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-muted-foreground sm:text-xs">
            歌わずに 2〜3 秒、テレビや部屋の音だけ鳴らして記憶します。
            そのスペクトルを、歌っているあいだ引きます。BGM や効果音向き。セリフは残りやすいです。
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={roomCapturing || !inputEnabled}
            onClick={() => void captureRoomProfile()}
          >
            {roomCapturing
              ? `記憶中 ${Math.round(roomCaptureProgress * 100)}%`
              : roomProfile
                ? "もう一度覚える"
                : "部屋を覚える"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!roomProfile || roomCapturing}
            onClick={() => clearRoomProfile()}
          >
            <Trash2 className="size-3.5" />
            忘れる
          </Button>
        </div>

        {roomCapturing && (
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-100"
              style={{ width: `${Math.round(roomCaptureProgress * 100)}%` }}
            />
          </div>
        )}

        <div className="mt-4">
          <FxRow
            label="部屋を引く"
            valueLabel={
              !roomProfile
                ? "未記憶"
                : roomAmount < 0.02
                  ? "オフ"
                  : `${Math.round(roomAmount * 100)}%`
            }
            hint="かけすぎると声も薄くなります"
          >
            <Slider
              min={0}
              max={100}
              step={1}
              disabled={!roomProfile}
              value={[Math.round(roomAmount * 100)]}
              onValueChange={([v]) => setRoomAmount((v ?? 0) / 100)}
            />
          </FxRow>
        </div>
      </section>

      <section
        className={cn(
          "rounded-2xl border border-border bg-card shadow-sm",
          isPage ? "p-4 sm:p-6" : "p-4",
        )}
      >
        <div className="mb-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground sm:text-base">
            <SlidersHorizontal className="size-4 text-primary" />
            エフェクト
          </h2>
          <p className="mt-1 text-[11px] text-muted-foreground sm:text-xs">
            ライブマイクとトラック再生の両方にかかります。録音しなくても使えます。
          </p>
        </div>

        <div
          className={cn(
            "space-y-5",
            isPage &&
              "sm:grid sm:grid-cols-2 sm:gap-x-8 sm:gap-y-6 sm:space-y-0",
          )}
        >
          <FxRow
            label="マスター音量"
            valueLabel={`${Math.round(master.volume * 100)}%`}
          >
            <Slider
              min={0}
              max={150}
              step={1}
              value={[Math.round(master.volume * 100)]}
              onValueChange={([v]) => setMaster({ volume: (v ?? 100) / 100 })}
            />
          </FxRow>
          <FxRow
            label="簡易ピッチシフト"
            valueLabel={`${master.pitchSemitones > 0 ? "+" : ""}${master.pitchSemitones} 半音`}
            hint="トラック再生向け（ライブマイクには非対応）"
          >
            <Slider
              min={-12}
              max={12}
              step={1}
              value={[master.pitchSemitones]}
              onValueChange={([v]) =>
                setMaster({ pitchSemitones: v ?? 0, preset: "original" })
              }
            />
          </FxRow>
          <FxRow
            label="フォルマント風 EQ"
            valueLabel={`${master.formantDb > 0 ? "+" : ""}${master.formantDb} dB`}
          >
            <Slider
              min={-12}
              max={12}
              step={1}
              value={[master.formantDb]}
              onValueChange={([v]) =>
                setMaster({ formantDb: v ?? 0, preset: "original" })
              }
            />
          </FxRow>
          <FxRow
            label="リバーブ"
            valueLabel={`${Math.round(master.reverbMix * 100)}%`}
          >
            <Slider
              min={0}
              max={100}
              step={1}
              value={[Math.round(master.reverbMix * 100)]}
              onValueChange={([v]) =>
                setMaster({ reverbMix: (v ?? 0) / 100, preset: "original" })
              }
            />
          </FxRow>
          <FxRow
            label="ノイズ抑え"
            valueLabel={
              master.noise < 0.02
                ? "オフ"
                : `${Math.round(master.noise * 100)}%`
            }
            hint="エアコンやファンのサー向け。かけすぎると息や高音が痩せます"
          >
            <Slider
              min={0}
              max={100}
              step={1}
              value={[Math.round((master.noise ?? 0) * 100)]}
              onValueChange={([v]) =>
                setMaster({ noise: (v ?? 0) / 100, preset: "original" })
              }
            />
          </FxRow>
          <FxRow
            label="コンプレッサー"
            valueLabel={`${Math.round(master.compressor * 100)}%`}
          >
            <Slider
              min={0}
              max={100}
              step={1}
              value={[Math.round(master.compressor * 100)]}
              onValueChange={([v]) =>
                setMaster({ compressor: (v ?? 0) / 100, preset: "original" })
              }
            />
          </FxRow>
        </div>
      </section>

      {isPage && (
        <section className="rounded-2xl border border-dashed border-border bg-muted/30 p-4 text-xs text-muted-foreground sm:p-5">
          <p className="font-medium text-foreground">使い方</p>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>
              <strong className="text-foreground">エフェクト ON</strong>
              を押す → マイク許可 → 話す／歌うとそのまま加工音が聞こえます
            </li>
            <li>録音やトラックがなくても、このタブだけでエフェクターとして使えます</li>
            <li>トラック再生や YouTube 伴奏にも同じエフェクトが乗ります</li>
            <li>
              テレビや部屋の音は、歌わずに「部屋を覚える」→「部屋を引く」
            </li>
          </ul>
        </section>
      )}
    </div>
  );
}

function FxRow({
  label,
  valueLabel,
  hint,
  children,
  className,
}: {
  label: string;
  valueLabel: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        <span className="text-xs tabular-nums text-foreground">{valueLabel}</span>
      </div>
      {children}
      {hint && (
        <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
