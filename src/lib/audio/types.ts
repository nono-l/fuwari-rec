import type { MidiNote } from "./midi";
import type { MidiInstrumentId } from "./midi-instruments";

export type MixPresetId =
  | "original"
  | "studio"
  | "radio"
  | "hall"
  | "whisper"
  | "bright";

export type TrackKind = "vocal" | "accompaniment" | "midi" | "other";

export interface Track {
  id: string;
  name: string;
  kind: TrackKind;
  /** Decoded PCM for offline/export & waveform */
  buffer: AudioBuffer | null;
  /** Snapshot before last destructive edit (separation etc.) */
  undoBuffer: AudioBuffer | null;
  /** Timeline start offset in seconds */
  offset: number;
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  color: string;
  /** Monophonic MIDI melody if this track was converted / imported as MIDI */
  midiNotes?: MidiNote[];
  /** Original timings before rhythm snap (pitches identical). */
  midiSourceNotes?: MidiNote[];
  midiInstrument?: MidiInstrumentId;
}

export interface MasterFx {
  volume: number;
  pitchSemitones: number;
  formantDb: number;
  reverbMix: number;
  compressor: number;
  /** 0 = off. High-pass + expander-style gate for room hiss / fan. */
  noise: number;
  preset: MixPresetId;
}

export interface MixPreset {
  id: MixPresetId;
  label: string;
  description: string;
  reverb: number;
  formant: number;
  pitch: number;
  compressor: number;
  noise: number;
}

export const MIX_PRESETS: MixPreset[] = [
  {
    id: "original",
    label: "そのまま",
    description: "原音に近いバランス",
    reverb: 0.05,
    formant: 0,
    pitch: 0,
    compressor: 0.2,
    noise: 0,
  },
  {
    id: "studio",
    label: "スタジオ",
    description: "締まった近接感",
    reverb: 0.16,
    formant: 1,
    pitch: 0,
    compressor: 0.45,
    noise: 0.22,
  },
  {
    id: "radio",
    label: "ラジオ",
    description: "帯域を絞った存在感",
    reverb: 0.08,
    formant: 4,
    pitch: 0,
    compressor: 0.6,
    noise: 0.35,
  },
  {
    id: "hall",
    label: "ホール",
    description: "広い空間の残響",
    reverb: 0.42,
    formant: 0,
    pitch: 0,
    compressor: 0.3,
    noise: 0.08,
  },
  {
    id: "whisper",
    label: "ささやき",
    description: "柔らかく近い声",
    reverb: 0.22,
    formant: -3,
    pitch: -1,
    compressor: 0.15,
    noise: 0.18,
  },
  {
    id: "bright",
    label: "明るい声",
    description: "高域を少し持ち上げ",
    reverb: 0.12,
    formant: 6,
    pitch: 1,
    compressor: 0.35,
    noise: 0.12,
  },
];

/** Track waveform accents — greens with complementary accents */
export const TRACK_COLORS = [
  "#0f766e",
  "#15803d",
  "#65a30d",
  "#0d9488",
  "#059669",
  "#4d7c0f",
] as const;
