import type { MidiNote } from "./midi";

export const BEATS_PER_BAR = 4;
export const WINDOW_BARS = 4;
export const WINDOW_BEATS = BEATS_PER_BAR * WINDOW_BARS;
export const GRID_BEAT = 0.25;
export const COLS = WINDOW_BEATS / GRID_BEAT;
export const VIEW_ROWS = 24;
export const MAX_MIDI_NOTES = 2000;

export const DRAW_LENGTHS = [
  { beats: 0.25, label: "16分音符" },
  { beats: 0.5, label: "8分音符" },
  { beats: 1, label: "4分音符" },
  { beats: 2, label: "2分音符" },
  { beats: 4, label: "全音符" },
] as const;

export function beatToSec(beat: number, bpm: number) {
  return (beat * 60) / Math.max(30, Math.min(240, bpm));
}

export function secToBeat(sec: number, bpm: number) {
  return sec * (Math.max(30, Math.min(240, bpm)) / 60);
}

export function snapBeat(beat: number, grid = GRID_BEAT) {
  return Math.max(0, Math.round(beat / grid) * grid);
}

export function isBlackKey(midi: number) {
  const n = ((midi % 12) + 12) % 12;
  return n === 1 || n === 3 || n === 6 || n === 8 || n === 10;
}

export function ensureNoteIds(notes: MidiNote[]): MidiNote[] {
  return notes.map((n, i) =>
    n.id
      ? n
      : {
          ...n,
          id: `n${i}-${Math.round(n.start * 1000)}-${n.midi}`,
        },
  );
}

export function noteCoversBeat(note: MidiNote, beat: number, bpm: number) {
  const start = secToBeat(note.start, bpm);
  const end = start + secToBeat(note.duration, bpm);
  return beat >= start - 1e-4 && beat < end - 1e-4;
}

export function findNoteAt(
  notes: MidiNote[],
  beat: number,
  pitch: number,
  bpm: number,
) {
  return notes.find((n) => n.midi === pitch && noteCoversBeat(n, beat, bpm));
}

export function toggleNoteAt(opts: {
  notes: MidiNote[];
  beat: number;
  pitch: number;
  bpm: number;
  drawBeats: number;
  velocity?: number;
}): { notes: MidiNote[]; action: "add" | "delete" | "full" } {
  const beat = snapBeat(opts.beat);
  const pitch = Math.max(24, Math.min(108, Math.round(opts.pitch)));
  const current = ensureNoteIds(opts.notes);
  const hit = findNoteAt(current, beat, pitch, opts.bpm);
  if (hit) {
    return {
      notes: current.filter((n) => n.id !== hit.id),
      action: "delete",
    };
  }
  if (current.length >= MAX_MIDI_NOTES) {
    return { notes: current, action: "full" };
  }
  const start = beatToSec(beat, opts.bpm);
  const duration = Math.max(0.04, beatToSec(opts.drawBeats, opts.bpm));
  const next: MidiNote = {
    id: `n${Date.now().toString(36)}-${pitch}-${Math.round(beat * 100)}`,
    midi: pitch,
    start,
    duration,
    velocity: opts.velocity ?? 0.82,
    channel: 0,
  };
  return { notes: [...current, next], action: "add" };
}

export function totalBeats(notes: MidiNote[], bpm: number, durationSec: number) {
  const fromNotes = notes.reduce(
    (m, n) => Math.max(m, secToBeat(n.start + n.duration, bpm)),
    0,
  );
  const fromDur = secToBeat(durationSec, bpm);
  return Math.max(WINDOW_BEATS, fromNotes, fromDur);
}

export function snapWindowBeat(beat: number) {
  const max = Math.max(0, Math.round(beat / WINDOW_BEATS) * WINDOW_BEATS);
  return Math.max(0, max);
}

export function centerViewLow(notes: MidiNote[]) {
  if (!notes.length) return 48;
  const pitches = notes.map((n) => n.midi).sort((a, b) => a - b);
  const mid = pitches[Math.floor(pitches.length / 2)] ?? 60;
  const low = mid - Math.floor(VIEW_ROWS / 2);
  return Math.max(24, Math.min(96, low));
}
