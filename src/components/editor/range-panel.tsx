import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  Music2,
  Play,
  RotateCcw,
  ScanSearch,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DevicePanel } from "@/components/editor/device-panel";
import { useEditorStore } from "@/lib/store/editor-store";
import {
  formatHz,
  hzToMidi,
  midiToNoteName,
  semitoneSpan,
} from "@/lib/audio/pitch";
import { cn } from "@/lib/utils";

const METER_LOW_MIDI = 40;
const METER_HIGH_MIDI = 84;

/** Live mic vocal-range measurement only. Media analysis is /analyze. */
export function RangePanel() {
  const measuring = useEditorStore((s) => s.rangeMeasuring);
  const busy = useEditorStore((s) => s.rangeBusy);
  const currentHz = useEditorStore((s) => s.rangeCurrentHz);
  const currentNote = useEditorStore((s) => s.rangeCurrentNote);
  const currentConfidence = useEditorStore((s) => s.rangeCurrentConfidence);
  const minHz = useEditorStore((s) => s.rangeMinHz);
  const maxHz = useEditorStore((s) => s.rangeMaxHz);
  const minNote = useEditorStore((s) => s.rangeMinNote);
  const maxNote = useEditorStore((s) => s.rangeMaxNote);
  const stable = useEditorStore((s) => s.rangeStable);
  const holdProgress = useEditorStore((s) => s.rangeHoldProgress);
  const inputEnabled = useEditorStore((s) => s.inputEnabled);
  const liveFxActive = useEditorStore((s) => s.liveFxActive);
  const startRangeTest = useEditorStore((s) => s.startRangeTest);
  const stopRangeTest = useEditorStore((s) => s.stopRangeTest);
  const resetRangeTest = useEditorStore((s) => s.resetRangeTest);
  const startLiveFx = useEditorStore((s) => s.startLiveFx);
  const mediaRangeResult = useEditorStore((s) => s.mediaRangeResult);

  const liveSpan =
    minHz != null && maxHz != null
      ? semitoneSpan(hzToMidi(minHz), hzToMidi(maxHz))
      : 0;

  const markers = useMemo(() => {
    const list: { midi: number; label: string }[] = [];
    for (
      let m = Math.ceil(METER_LOW_MIDI / 12) * 12;
      m <= METER_HIGH_MIDI;
      m += 12
    ) {
      if (m >= METER_LOW_MIDI) list.push({ midi: m, label: midiToNoteName(m) });
    }
    return list;
  }, []);

  const pos = (hz: number | null) => {
    if (hz == null) return null;
    const midi = hzToMidi(hz);
    const t = (midi - METER_LOW_MIDI) / (METER_HIGH_MIDI - METER_LOW_MIDI);
    return Math.max(0, Math.min(1, t));
  };

  return (
    <div className="space-y-4">
      <DevicePanel />

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Music2 className="size-5 text-primary" />
              マイク声域測定
            </h2>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
              安定して出せる低音〜高音を測ります。読み込んだ曲の解析は{" "}
              <Link
                to="/analyze"
                className="font-medium text-primary hover:underline"
              >
                音源解析
              </Link>
              タブへ。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!measuring ? (
              <Button
                type="button"
                disabled={busy || !inputEnabled}
                onClick={() => void startRangeTest()}
              >
                <Play className="size-4" />
                測定スタート
              </Button>
            ) : (
              <Button type="button" variant="danger" onClick={stopRangeTest}>
                <Square className="size-4" />
                ストップ
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              disabled={measuring}
              onClick={resetRangeTest}
            >
              <RotateCcw className="size-4" />
              リセット
            </Button>
          </div>
        </div>

        {!inputEnabled && (
          <p className="mt-3 text-xs text-danger">
            入力がオフです。デバイス設定で入力をオンにしてください。
          </p>
        )}

        <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
          <StatCard
            label="いま"
            value={currentNote ?? "—"}
            sub={
              currentHz != null
                ? `${formatHz(currentHz)} · ${Math.round(currentConfidence * 100)}%`
                : measuring
                  ? "声を出して"
                  : "待機"
            }
            accent={measuring && currentHz != null}
          />
          <StatCard
            label="最低"
            value={minNote ?? "—"}
            sub={minHz != null ? formatHz(minHz) : "—"}
          />
          <StatCard
            label="最高"
            value={maxNote ?? "—"}
            sub={maxHz != null ? formatHz(maxHz) : "—"}
          />
        </div>

        <div className="mt-4">
          <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Activity className="size-3.5" />
              安定ホールド
            </span>
            <span>
              {stable
                ? "安定！"
                : measuring
                  ? `${Math.round(holdProgress * 100)}%`
                  : "—"}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-75",
                stable ? "bg-success" : "bg-primary",
              )}
              style={{ width: `${Math.round(holdProgress * 100)}%` }}
            />
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-1.5 text-[11px] text-muted-foreground">
            {minNote && maxNote
              ? `${minNote} 〜 ${maxNote} · ${liveSpan} 半音`
              : "マイクの安定音がまだありません"}
          </div>
          <div className="relative h-14 rounded-xl border border-border bg-muted/40">
            {markers.map((m) => {
              const t =
                (m.midi - METER_LOW_MIDI) /
                (METER_HIGH_MIDI - METER_LOW_MIDI);
              return (
                <div
                  key={m.midi}
                  className="absolute top-0 bottom-0 border-l border-border/70"
                  style={{ left: `${t * 100}%` }}
                >
                  <span className="absolute bottom-1 left-1 text-[10px] text-muted-foreground">
                    {m.label}
                  </span>
                </div>
              );
            })}
            {pos(minHz) != null && pos(maxHz) != null && (
              <div
                className="absolute top-3 bottom-3 rounded-md bg-primary/25 ring-1 ring-primary/40"
                style={{
                  left: `${pos(minHz)! * 100}%`,
                  width: `${Math.max(1, (pos(maxHz)! - pos(minHz)!) * 100)}%`,
                }}
              />
            )}
            {pos(currentHz) != null && (
              <div
                className="absolute top-1 bottom-1 w-0.5 bg-primary shadow-[0_0_8px_var(--color-primary)]"
                style={{ left: `${pos(currentHz)! * 100}%` }}
              >
                <div className="absolute -top-0.5 left-1/2 size-2.5 -translate-x-1/2 rounded-full bg-primary" />
              </div>
            )}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>低 ←</span>
            <span>→ 高</span>
          </div>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          {liveFxActive ? (
            "エフェクター ON 中 — モニターしながら測定できます"
          ) : (
            <>
              声を聴きながら測る場合は{" "}
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() => void startLiveFx()}
              >
                エフェクト ON
              </button>
            </>
          )}
        </p>
      </section>

      {mediaRangeResult && (
        <section className="rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
            <ScanSearch className="size-3.5 text-primary" />
            音源解析の結果
          </span>
          <span className="mt-1 block sm:ml-5 sm:inline sm:mt-0">
            {mediaRangeResult.trackName}: {mediaRangeResult.minNote} 〜{" "}
            {mediaRangeResult.maxNote}（{mediaRangeResult.spanSemitones} 半音）
            {" · "}
            <Link
              to="/analyze"
              className="font-medium text-primary hover:underline"
            >
              音源解析タブで詳細
            </Link>
          </span>
        </section>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-2.5 py-2.5",
        accent
          ? "border-primary bg-primary/8"
          : "border-border bg-muted/30",
      )}
    >
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-lg font-semibold tracking-tight text-foreground">
        {value}
      </div>
      <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
        {sub}
      </div>
    </div>
  );
}
