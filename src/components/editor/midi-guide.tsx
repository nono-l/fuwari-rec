import { useMemo } from "react";
import { Music2 } from "lucide-react";
import { useEditorStore } from "@/lib/store/editor-store";
import { hzToMidi, midiToNoteName } from "@/lib/audio/pitch";
import {
  bandLabel,
  melodyNotesFromTracks,
  midiExtent,
  noteAtTime,
  noteNameToMidi,
  reachHint,
} from "@/lib/audio/midi-guide";
import { cn } from "@/lib/utils";

const PAD_L = 28;
const PAD_R = 8;
const PAD_T = 10;
const PAD_B = 14;

export function MidiGuide() {
  const tracks = useEditorStore((s) => s.tracks);
  const currentTime = useEditorStore((s) => s.currentTime);
  const duration = useEditorStore((s) => s.duration);
  const minHz = useEditorStore((s) => s.rangeMinHz);
  const maxHz = useEditorStore((s) => s.rangeMaxHz);
  const media = useEditorStore((s) => s.mediaRangeResult);

  const notes = useMemo(() => melodyNotesFromTracks(tracks), [tracks]);
  const melody = useMemo(() => midiExtent(notes), [notes]);
  const user =
    minHz != null && maxHz != null
      ? { min: hzToMidi(minHz), max: hzToMidi(maxHz), label: "あなた" }
      : null;
  const song =
    media && noteNameToMidi(media.minNote) != null && noteNameToMidi(media.maxNote) != null
      ? {
          min: noteNameToMidi(media.minNote)!,
          max: noteNameToMidi(media.maxNote)!,
          label: "音源",
        }
      : null;

  const yMin = Math.min(
    40,
    melody?.min ?? 48,
    user?.min ?? 48,
    song?.min ?? 48,
  ) - 2;
  const yMax = Math.max(
    84,
    melody?.max ?? 72,
    user?.max ?? 72,
    song?.max ?? 72,
  ) + 2;
  const tMax = Math.max(duration, melody?.end ?? 0, 1);
  const nowNote = noteAtTime(notes, currentTime);
  const hint = reachHint(
    user ? { min: user.min, max: user.max, label: "あなた" } : null,
    melody ? { min: melody.min, max: melody.max, label: "メロディ" } : null,
  );

  if (!notes.length && !user && !song) return null;

  const xOf = (t: number) => PAD_L + (t / tMax) * (320 - PAD_L - PAD_R);
  const yOf = (m: number) => {
    const t = (m - yMin) / Math.max(1, yMax - yMin);
    return PAD_T + (1 - t) * (108 - PAD_T - PAD_B);
  };

  const w = 320;
  const h = 108;

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Music2 className="size-4 text-primary" />
            MIDI ガイド
          </h3>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            読み込みメロディを時間の曲線にして、声域と重ねます
          </p>
        </div>
        {nowNote && (
          <span className="text-[12px] font-semibold tabular-nums text-primary">
            いま {midiToNoteName(nowNote.midi)}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {melody && (
          <span>
            メロディ{" "}
            <span className="font-medium text-foreground">
              {bandLabel(melody.min, melody.max)}
            </span>
            <span className="text-muted-foreground"> · {melody.span} 半音</span>
          </span>
        )}
        {user && (
          <span>
            あなた{" "}
            <span className="font-medium text-foreground">
              {bandLabel(user.min, user.max)}
            </span>
          </span>
        )}
        {song && (
          <span>
            音源{" "}
            <span className="font-medium text-foreground">
              {bandLabel(song.min, song.max)}
            </span>
          </span>
        )}
      </div>
      {hint && (
        <p
          className={cn(
            "mt-1.5 text-[11px]",
            hint.includes("足りない") ? "text-danger" : "text-primary",
          )}
        >
          {hint}
        </p>
      )}
      <div className="mt-2 overflow-hidden rounded-xl border border-border bg-muted/40">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="block h-28 w-full"
          role="img"
          aria-label="メロディと声域の重ね"
        >
          {user && (
            <rect
              x={PAD_L}
              y={yOf(user.max)}
              width={w - PAD_L - PAD_R}
              height={Math.max(2, yOf(user.min) - yOf(user.max))}
              fill="currentColor"
              className="text-primary"
              opacity={0.16}
            />
          )}
          {song && (
            <rect
              x={PAD_L}
              y={yOf(song.max)}
              width={w - PAD_L - PAD_R}
              height={Math.max(2, yOf(song.min) - yOf(song.max))}
              fill="none"
              stroke="currentColor"
              className="text-muted-foreground"
              strokeDasharray="3 2"
              opacity={0.7}
            />
          )}
          {notes.map((n, i) => {
            const x = xOf(n.start);
            const ww = Math.max(1.2, xOf(n.start + n.duration) - x);
            const y = yOf(n.midi + 0.4);
            const hh = Math.max(2.2, yOf(n.midi - 0.4) - y);
            return (
              <rect
                key={`${n.start}-${n.midi}-${i}`}
                x={x}
                y={y}
                width={ww}
                height={hh}
                rx={0.8}
                className="fill-foreground/70"
              />
            );
          })}
          <line
            x1={xOf(currentTime)}
            x2={xOf(currentTime)}
            y1={PAD_T}
            y2={h - PAD_B}
            className="stroke-primary"
            strokeWidth={1.2}
          />
          <text
            x={4}
            y={yOf(yMax - 0.2) + 3}
            className="fill-muted-foreground"
            fontSize="8"
          >
            {midiToNoteName(yMax)}
          </text>
          <text
            x={4}
            y={yOf(yMin) + 3}
            className="fill-muted-foreground"
            fontSize="8"
          >
            {midiToNoteName(yMin)}
          </text>
        </svg>
      </div>
      {!notes.length && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          MIDI を読み込むとメロディの曲線が出ます
        </p>
      )}
    </section>
  );
}
