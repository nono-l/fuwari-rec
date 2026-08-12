import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import {
  AudioWaveform,
  Music2,
  RotateCcw,
  ScanSearch,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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

export function MediaRangePanel() {
  const tracks = useEditorStore((s) => s.tracks);
  const mediaRangeTrackId = useEditorStore((s) => s.mediaRangeTrackId);
  const mediaRangeAnalyzing = useEditorStore((s) => s.mediaRangeAnalyzing);
  const mediaRangeProgress = useEditorStore((s) => s.mediaRangeProgress);
  const mediaRangeResult = useEditorStore((s) => s.mediaRangeResult);
  const setMediaRangeTrackId = useEditorStore((s) => s.setMediaRangeTrackId);
  const analyzeMediaRange = useEditorStore((s) => s.analyzeMediaRange);
  const clearMediaRangeResult = useEditorStore((s) => s.clearMediaRangeResult);
  const activeTrackId = useEditorStore((s) => s.activeTrackId);
  const rangeMinNote = useEditorStore((s) => s.rangeMinNote);
  const rangeMaxNote = useEditorStore((s) => s.rangeMaxNote);
  const rangeMinHz = useEditorStore((s) => s.rangeMinHz);
  const rangeMaxHz = useEditorStore((s) => s.rangeMaxHz);

  const tracksWithAudio = tracks.filter((t) => !!t.buffer);
  const selectedMediaId =
    mediaRangeTrackId ??
    (tracksWithAudio.some((t) => t.id === activeTrackId)
      ? activeTrackId
      : (tracksWithAudio[0]?.id ?? null));

  const liveSpan =
    rangeMinHz != null && rangeMaxHz != null
      ? semitoneSpan(hzToMidi(rangeMinHz), hzToMidi(rangeMaxHz))
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
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-xl">
            <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <ScanSearch className="size-5 text-primary" />
              入力メディアの声域解析
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              スタジオで読み込んだ音声・動画を解析します。音源キャンセル後のボーカル帯域を測ると、
              実際に歌われていたレンジが把握しやすくなります。
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="space-y-3">
            <label className="block text-xs text-muted-foreground">
              対象トラック
              <select
                className="mt-1 w-full rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                value={selectedMediaId ?? ""}
                onChange={(e) => setMediaRangeTrackId(e.target.value || null)}
                disabled={mediaRangeAnalyzing || tracksWithAudio.length === 0}
              >
                {tracksWithAudio.length === 0 ? (
                  <option value="">
                    音源なし — スタジオで読み込んでください
                  </option>
                ) : (
                  tracksWithAudio.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.buffer ? `（${t.buffer.duration.toFixed(1)}秒）` : ""}
                    </option>
                  ))
                )}
              </select>
            </label>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={
                  mediaRangeAnalyzing ||
                  !selectedMediaId ||
                  tracksWithAudio.length === 0
                }
                onClick={() =>
                  void analyzeMediaRange({
                    trackId: selectedMediaId ?? undefined,
                    isolateVocals: true,
                  })
                }
                title="センター寄りのボーカルを残してから声域を解析"
              >
                <AudioWaveform className="size-4" />
                {mediaRangeAnalyzing
                  ? `解析中 ${Math.round(mediaRangeProgress * 100)}%`
                  : "音源キャンセルして解析"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={
                  mediaRangeAnalyzing ||
                  !selectedMediaId ||
                  tracksWithAudio.length === 0
                }
                onClick={() =>
                  void analyzeMediaRange({
                    trackId: selectedMediaId ?? undefined,
                    isolateVocals: false,
                  })
                }
              >
                そのまま解析
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={!mediaRangeResult}
                onClick={clearMediaRangeResult}
              >
                <RotateCcw className="size-4" />
                結果クリア
              </Button>
            </div>

            {mediaRangeAnalyzing && (
              <div>
                <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
                  <span>スキャン進捗</span>
                  <span>{Math.round(mediaRangeProgress * 100)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-150"
                    style={{
                      width: `${Math.round(mediaRangeProgress * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {tracksWithAudio.length === 0 && (
              <p className="rounded-xl border border-dashed border-border bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
                まだ音源がありません。{" "}
                <Link to="/" className="font-medium text-primary hover:underline">
                  スタジオ
                </Link>
                で音声・動画・MIDI を読み込んでから戻ってきてください。
              </p>
            )}

            <ul className="space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <li>
                · おすすめ: スタジオで曲を読み込み → こちらで「音源キャンセルして解析」
              </li>
              <li>
                · ステレオでセンターに寄った歌声が検出されやすいです
              </li>
              <li>
                · 自分の声との比較は{" "}
                <Link
                  to="/range"
                  className="font-medium text-primary hover:underline"
                >
                  声域測定
                </Link>
                タブでも行えます
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <StatCard
                label="トラック"
                value={
                  mediaRangeResult
                    ? mediaRangeResult.trackName.slice(0, 10)
                    : "—"
                }
                sub={
                  mediaRangeResult
                    ? mediaRangeResult.usedVocalIsolation
                      ? "音源キャンセル後"
                      : "原音のまま"
                    : "未解析"
                }
              />
              <StatCard
                label="最低"
                value={mediaRangeResult?.minNote ?? "—"}
                sub={
                  mediaRangeResult ? formatHz(mediaRangeResult.minHz) : "—"
                }
              />
              <StatCard
                label="最高"
                value={mediaRangeResult?.maxNote ?? "—"}
                sub={
                  mediaRangeResult ? formatHz(mediaRangeResult.maxHz) : "—"
                }
              />
            </div>

            <RangeMeter
              markers={markers}
              minPos={pos(mediaRangeResult?.minHz ?? null)}
              maxPos={pos(mediaRangeResult?.maxHz ?? null)}
              label={
                mediaRangeResult
                  ? `${mediaRangeResult.minNote} 〜 ${mediaRangeResult.maxNote} · ${mediaRangeResult.spanSemitones} 半音（安定 ${mediaRangeResult.stableHits} 点）`
                  : "解析結果のレンジがここに表示されます"
              }
            />
          </div>
        </div>
      </section>

      {(rangeMinNote && rangeMaxNote) || mediaRangeResult ? (
        <section className="rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-3">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Music2 className="size-3.5 text-primary" />
            マイク測定との比較
          </h3>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
            <span>
              マイク:{" "}
              <strong className="text-foreground">
                {rangeMinNote && rangeMaxNote
                  ? `${rangeMinNote} 〜 ${rangeMaxNote}`
                  : "未測定"}
              </strong>
            </span>
            <span>
              音源:{" "}
              <strong className="text-foreground">
                {mediaRangeResult
                  ? `${mediaRangeResult.minNote} 〜 ${mediaRangeResult.maxNote}`
                  : "未解析"}
              </strong>
            </span>
            {rangeMinNote && rangeMaxNote && mediaRangeResult && (
              <span>
                音源のほうが
                {mediaRangeResult.spanSemitones > liveSpan
                  ? ` 広い（+${mediaRangeResult.spanSemitones - liveSpan} 半音）`
                  : mediaRangeResult.spanSemitones < liveSpan
                    ? ` 狭い（${liveSpan - mediaRangeResult.spanSemitones} 半音差）`
                    : " 同程度"}
              </span>
            )}
            {!(rangeMinNote && rangeMaxNote) && (
              <Link
                to="/range"
                className="font-medium text-primary hover:underline"
              >
                声域測定タブでマイク測定する →
              </Link>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 px-2.5 py-2.5">
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

function RangeMeter({
  markers,
  minPos,
  maxPos,
  label,
}: {
  markers: { midi: number; label: string }[];
  minPos: number | null;
  maxPos: number | null;
  label: string;
}) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] text-muted-foreground">{label}</div>
      <div className="relative h-14 rounded-xl border border-border bg-muted/40">
        {markers.map((m) => {
          const t =
            (m.midi - METER_LOW_MIDI) / (METER_HIGH_MIDI - METER_LOW_MIDI);
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
        {minPos != null && maxPos != null && (
          <div
            className="absolute top-3 bottom-3 rounded-md bg-emerald-500/25 ring-1 ring-emerald-600/30"
            style={{
              left: `${minPos * 100}%`,
              width: `${Math.max(1, (maxPos - minPos) * 100)}%`,
            }}
          />
        )}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>低 ←</span>
        <span>→ 高</span>
      </div>
    </div>
  );
}
