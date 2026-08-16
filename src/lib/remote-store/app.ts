/** Fuwari-specific profile. Core stays app-agnostic. */
export const FUWARI_APP = {
  id: "fuwari",
  name: "Fuwari REC",
  settingsKey: "settings.latest",
  snapKind: "settings",
  /** Keep existing browsers' saved proxy URL / keys */
  configStorageKey: "fuwari.remote-store.config.v1",
} as const;

export type FuwariRemoteSettings = {
  version: 1;
  savedAt: string;
  master: {
    volume: number;
    pitchSemitones: number;
    formantDb: number;
    reverbMix: number;
    compressor: number;
    noise?: number;
    preset: string;
  };
  range?: {
    minHz: number | null;
    maxHz: number | null;
    minNote: string | null;
    maxNote: string | null;
  };
  mediaRange?: {
    minNote: string;
    maxNote: string;
    minHz: number;
    maxHz: number;
    spanSemitones: number;
    trackName: string;
    usedVocalIsolation: boolean;
  } | null;
  bpm: number;
};
