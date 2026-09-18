import type { MidiNote } from "./midi";
import type { Track } from "./types";
import { midiToNoteName, semitoneSpan } from "./pitch";

const NOTE_PC: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

export function noteNameToMidi(name: string): number | null {
  const m = name
    .trim()
    .toUpperCase()
    .replace("♯", "#")
    .replace("♭", "B")
    .match(/^([A-G])(#|B)?(-?\d)$/);
  if (!m) return null;
  const pc = NOTE_PC[m[1]!]!;
  const acc = m[2] === "#" ? 1 : m[2] === "B" ? -1 : 0;
  const oct = Number(m[3]);
  if (!Number.isFinite(oct)) return null;
  return (oct + 1) * 12 + pc + acc;
}

export function melodyNotesFromTracks(tracks: Track[]): MidiNote[] {
  const out: MidiNote[] = [];
  for (const t of tracks) {
    if (!t.midiNotes?.length) continue;
    if (t.muted) continue;
    for (const n of t.midiNotes) out.push(n);
  }
  return out;
}

export function midiExtent(notes: MidiNote[]) {
  if (!notes.length) return null;
  let min = notes[0]!.midi;
  let max = notes[0]!.midi;
  let end = 0;
  for (const n of notes) {
    if (n.midi < min) min = n.midi;
    if (n.midi > max) max = n.midi;
    const e = n.start + n.duration;
    if (e > end) end = e;
  }
  return { min, max, end, span: semitoneSpan(min, max) };
}

export function noteAtTime(notes: MidiNote[], t: number): MidiNote | null {
  let hit: MidiNote | null = null;
  for (const n of notes) {
    if (t >= n.start && t < n.start + n.duration) {
      if (!hit || n.velocity >= hit.velocity) hit = n;
    }
  }
  return hit;
}

export type RangeBand = { min: number; max: number; label: string };

export function reachHint(user: RangeBand | null, melody: RangeBand | null) {
  if (!user || !melody) return "";
  const lowGap = user.min - melody.min;
  const highGap = melody.max - user.max;
  const bits: string[] = [];
  if (lowGap > 0.4) bits.push(`低い方 ${Math.round(lowGap)} 半音足りない`);
  if (highGap > 0.4) bits.push(`高い方 ${Math.round(highGap)} 半音足りない`);
  if (!bits.length) return "このメロディは声域に収まっています";
  return bits.join(" · ");
}

export function bandLabel(min: number, max: number) {
  return `${midiToNoteName(min)} 〜 ${midiToNoteName(max)}`;
}
