import { Link } from "@tanstack/react-router";
import { Music2, ScanSearch, SlidersHorizontal } from "lucide-react";
import { AppShell } from "@/components/editor/app-shell";
import { TrackRow } from "@/components/editor/track-row";
import { YoutubePanel } from "@/components/editor/youtube-panel";
import { SeparationPanel } from "@/components/editor/separation-panel";
import { MelodyMidiPanel } from "@/components/editor/melody-midi-panel";
import { TapRhythmPanel } from "@/components/editor/tap-rhythm-panel";
import { RhythmPadPanel } from "@/components/editor/rhythm-pad-panel";
import { DevicePanel } from "@/components/editor/device-panel";
import { useEditorStore } from "@/lib/store/editor-store";
import { MIX_PRESETS } from "@/lib/audio/types";

export function Studio() {
  const tracks = useEditorStore((s) => s.tracks);
  const ready = useEditorStore((s) => s.ready);
  const master = useEditorStore((s) => s.master);
  const liveFxActive = useEditorStore((s) => s.liveFxActive);
  const rangeMinNote = useEditorStore((s) => s.rangeMinNote);
  const rangeMaxNote = useEditorStore((s) => s.rangeMaxNote);
  const mediaRangeResult = useEditorStore((s) => s.mediaRangeResult);

  const presetLabel =
    MIX_PRESETS.find((p) => p.id === master.preset)?.label ?? "カスタム";

  return (
    <AppShell
      title="もっと手軽に 歌える"
      description="録音・YouTube伴奏はスタジオから。エフェクト・声域・音源解析は各タブへ。"
    >
      <div className="space-y-4">
        <DevicePanel />
        <YoutubePanel />

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2 px-0.5">
              <h2 className="text-sm font-semibold text-foreground">トラック</h2>
              <span className="text-[11px] text-muted-foreground">
                波形クリックで再生位置を移動
              </span>
            </div>
            {!ready ? (
              <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
                エンジンを初期化中…
              </div>
            ) : tracks.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
                <p className="text-sm font-medium text-foreground">
                  赤い「録音」を押すと、その場から録れます
                </p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  押すと時計が進みます。もう一度押すと停止して、トラックに入ります。
                  伴奏や YouTube を先に読み込んでおくと、合わせながら歌えます。
                </p>
              </div>
            ) : (
              tracks.map((t) => <TrackRow key={t.id} track={t} />)
            )}
          </section>

          <div className="flex flex-col gap-4">
            <SeparationPanel />
            <MelodyMidiPanel />
            <RhythmPadPanel />
            <TapRhythmPanel />
            <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-foreground">
                ほかのタブ
              </h2>
              <p className="mt-1 text-[11px] text-muted-foreground">
                機能ごとに画面が分かれています。
              </p>
              <dl className="mt-3 space-y-1.5 text-xs">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">声域（マイク）</dt>
                  <dd className="font-medium text-foreground">
                    {rangeMinNote && rangeMaxNote
                      ? `${rangeMinNote} 〜 ${rangeMaxNote}`
                      : "未測定"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">音源解析</dt>
                  <dd className="font-medium text-foreground">
                    {mediaRangeResult
                      ? `${mediaRangeResult.minNote} 〜 ${mediaRangeResult.maxNote}`
                      : "未解析"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">エフェクター</dt>
                  <dd className="font-medium text-foreground">
                    {liveFxActive ? "LIVE" : "待機"} · {presetLabel}
                  </dd>
                </div>
              </dl>
              <div className="mt-4 grid gap-2">
                <Link
                  to="/analyze"
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
                >
                  <ScanSearch className="size-3.5" />
                  音源解析タブへ
                </Link>
                <Link
                  to="/range"
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-border bg-card px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  <Music2 className="size-3.5" />
                  声域測定タブへ
                </Link>
                <Link
                  to="/effector"
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-border bg-card px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  <SlidersHorizontal className="size-3.5" />
                  エフェクタータブへ
                </Link>
              </div>
            </section>
            <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <h2 className="mb-2 text-sm font-semibold text-foreground">
                ショートカット
              </h2>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                <li>
                  <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                    Space
                  </kbd>{" "}
                  再生 / 一時停止
                </li>
                <li>
                  <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                    R
                  </kbd>{" "}
                  録音開始 / 停止（時間が進みます）
                </li>
                <li>
                  <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                    S
                  </kbd>{" "}
                  停止
                </li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
