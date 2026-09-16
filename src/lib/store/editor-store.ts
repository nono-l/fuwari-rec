import { create } from "zustand";
import {
  MIX_PRESETS,
  TRACK_COLORS,
  type MasterFx,
  type MixPresetId,
  type Track,
  type TrackKind,
} from "@/lib/audio/types";
import {
  DEFAULT_MASTER_FX,
  MAX_OBS_INSERTS,
  labelObsInserts,
  newObsInsert,
  normalizeMasterFx,
  type ObsFilterId,
  type ObsInsert,
} from "@/lib/audio/obs-filters";
import {
  MAX_AI_VOICE,
  newAiVoiceInsert,
  setAiModelFile,
  type AiVoiceInsert,
} from "@/lib/audio/ai-voice";
import { getAudioEngine, type EngineStatus } from "@/lib/audio/engine";
import {
  assembleLiveFx,
  reconcileLiveChain,
  shiftLiveSlot,
  type LiveSlot,
} from "@/lib/audio/live-fx";
import {
  CABLE_INDEXES,
  MAX_CABLE_INSERTS,
  MAX_CABLES,
  asCableIndex,
  defaultCableName,
  newCableInsert,
  type CableInsert,
  type CableKind,
} from "@/lib/audio/cables";
import {
  extraPipelineBudget,
  cpuCores,
  cpuOverBudget,
  cpuRefuseMessage,
  cpuWarnNote,
  newExtraPipeline,
  type ExtraPipeline,
  type PipelineVia,
} from "@/lib/audio/fx-pipeline";
import {
  MAX_DEVICE_IO,
  defaultDeviceIoName,
  newDeviceIoInsert,
  type DeviceIoInsert,
  type DeviceIoKind,
} from "@/lib/audio/device-io";
import {
  cloneAudioBuffer,
  processSeparation,
  type SeparationMode,
} from "@/lib/audio/separation";
import { renderPitchBars, renderOnePitchBar, stampPitchSources } from "@/lib/audio/pitch-bars";
import {
  ensureMicPermission,
  listAudioDevices,
  subscribeDeviceChanges,
  supportsOutputSinkSelection,
  type AudioDeviceInfo,
} from "@/lib/audio/devices";
import {
  centsBetween,
  detectPitch,
  hzToMidi,
  midiToNoteName,
} from "@/lib/audio/pitch";
import {
  isMidiFile,
  parseMidi,
  midiPartsFromParsed,
  renderMidiToAudioBuffer,
  type MidiNote,
} from "@/lib/audio/midi";
import {
  centerViewLow,
  DRAW_LENGTHS,
  MAX_MIDI_NOTES,
  ensureNoteIds,
  snapBeat,
  snapWindowBeat,
  toggleNoteAt,
  beatToSec,
  secToBeat,
  patchNoteById,
} from "@/lib/audio/midi-edit";
import { isVideoFile } from "@/lib/audio/media-decode";
import {
  applyRhythmOnly,
  encodeMidiFile,
  melodyFromBuffer,
  melodySummary,
  notesToParsed,
  type RhythmGrid,
} from "@/lib/audio/pitch-to-midi";
import {
  analyzeBufferVocalRange,
  type MediaRangeResult,
} from "@/lib/audio/range-analyze";
import {
  MAX_SPECTRUM_FILTERS,
  newSpectrumFilter,
  type SpectrumFilter,
  type SpectrumFilterKind,
} from "@/lib/audio/spectrum-filters";
import { normalizeSnapshot, type FxSnapshot } from "@/lib/audio/fx-snapshot";
import {
  MAX_YOUTUBE_CLIPS,
  newYoutubeClip,
  type YoutubeClip,
} from "@/lib/youtube-clips";
import {
  DEFAULT_MIDI_INSTRUMENT,
  instrumentFromGm,
  instrumentLabel,
  type MidiInstrumentId,
} from "@/lib/audio/midi-instruments";
import type { RoomProfile } from "@/lib/audio/room-profile";
import {
  isYouTubePlayerReady,
  youtubeGetCurrentTime,
  youtubeGetDuration,
  youtubePause,
  youtubePlay,
  youtubeSeek,
  youtubeStop,
  youtubeSetMuted,
  youtubeKeepPlaying,
  setYouTubeEndedHandler,
} from "@/lib/youtube-player";
import { downloadBlob } from "@/lib/utils";

function uid() {
  return `t_${Math.random().toString(36).slice(2, 10)}`;
}

function pushLiveFx(s: {
  liveChain: LiveSlot[];
  spectrumFilters: SpectrumFilter[];
  obsInserts: ObsInsert[];
  aiVoice: AiVoiceInsert | null;
  cableInserts?: CableInsert[];
  deviceInserts?: DeviceIoInsert[];
  extraPipelines?: ExtraPipeline[];
  pipelineVia?: PipelineVia;
}) {
  const cables = s.cableInserts ?? [];
  const devices = s.deviceInserts ?? [];
  const liveChain = reconcileLiveChain(
    s.liveChain,
    s.spectrumFilters,
    s.obsInserts,
    s.aiVoice,
    cables,
    devices,
  );
  try {
    const engine = getAudioEngine();
    engine.setLiveFx(
      assembleLiveFx(
        liveChain,
        s.spectrumFilters,
        s.obsInserts,
        s.aiVoice,
        cables,
        devices,
      ),
    );
    engine.setPipelineGraph(s.extraPipelines ?? []);
  } catch {
    /* not ready */
  }
  return liveChain;
}

type ChainSlice = {
  liveChain: LiveSlot[];
  spectrumFilters: SpectrumFilter[];
  obsInserts: ObsInsert[];
  aiVoice: AiVoiceInsert | null;
  cableInserts: CableInsert[];
  deviceInserts: DeviceIoInsert[];
};

function activeExtra(s: {
  activePipelineId: "main" | string;
  extraPipelines: ExtraPipeline[];
}) {
  if (s.activePipelineId === "main") return null;
  return s.extraPipelines.find((p) => p.id === s.activePipelineId) ?? null;
}

function readChain(s: {
  activePipelineId: "main" | string;
  extraPipelines: ExtraPipeline[];
  liveChain: LiveSlot[];
  spectrumFilters: SpectrumFilter[];
  obsInserts: ObsInsert[];
  aiVoice: AiVoiceInsert | null;
  cableInserts: CableInsert[];
  deviceInserts: DeviceIoInsert[];
}): ChainSlice {
  const p = activeExtra(s);
  if (!p) {
    return {
      liveChain: s.liveChain,
      spectrumFilters: s.spectrumFilters,
      obsInserts: s.obsInserts,
      aiVoice: s.aiVoice,
      cableInserts: s.cableInserts,
      deviceInserts: s.deviceInserts,
    };
  }
  return {
    liveChain: p.liveChain,
    spectrumFilters: p.spectrumFilters,
    obsInserts: p.obsInserts,
    aiVoice: p.aiVoice,
    cableInserts: p.cableInserts ?? [],
    deviceInserts: p.deviceInserts ?? [],
  };
}

function loadAfterChainPatch(
  s: {
    spectrumFilters: SpectrumFilter[];
    obsInserts: ObsInsert[];
    aiVoice: AiVoiceInsert | null;
    extraPipelines: ExtraPipeline[];
    activePipelineId: "main" | string;
  },
  patch: Partial<ChainSlice>,
) {
  const p = activeExtra(s);
  if (!p) {
    return cpuOverBudget({
      spectrumFilters: patch.spectrumFilters ?? s.spectrumFilters,
      obsInserts: patch.obsInserts ?? s.obsInserts,
      aiVoice: patch.aiVoice !== undefined ? patch.aiVoice : s.aiVoice,
      extraPipelines: s.extraPipelines,
    });
  }
  const extraPipelines = s.extraPipelines.map((x) =>
    x.id === p.id
      ? {
          ...x,
          spectrumFilters: patch.spectrumFilters ?? x.spectrumFilters,
          obsInserts: patch.obsInserts ?? x.obsInserts,
          aiVoice: patch.aiVoice !== undefined ? patch.aiVoice : x.aiVoice,
        }
      : x,
  );
  return cpuOverBudget({
    spectrumFilters: s.spectrumFilters,
    obsInserts: s.obsInserts,
    aiVoice: s.aiVoice,
    extraPipelines,
  });
}

function cpuStatus(ok: string, check: { warn: boolean; load: number; budget: number }) {
  return check.warn ? `${ok}${cpuWarnNote(check.load, check.budget)}` : ok;
}

function anyAiVoice(s: {
  aiVoice: AiVoiceInsert | null;
  extraPipelines: ExtraPipeline[];
}) {
  if (s.aiVoice) return s.aiVoice;
  for (const p of s.extraPipelines) {
    if (p.aiVoice) return p.aiVoice;
  }
  return null;
}

function pipeSlots(p: ExtraPipeline, order = p.liveChain): LiveSlot[] {
  return reconcileLiveChain(
    order,
    p.spectrumFilters,
    p.obsInserts,
    p.aiVoice,
    p.cableInserts ?? [],
    p.deviceInserts ?? [],
  );
}

function commitChain(
  get: () => {
    activePipelineId: "main" | string;
    extraPipelines: ExtraPipeline[];
    liveChain: LiveSlot[];
    spectrumFilters: SpectrumFilter[];
    obsInserts: ObsInsert[];
    aiVoice: AiVoiceInsert | null;
    cableInserts: CableInsert[];
    deviceInserts: DeviceIoInsert[];
    pipelineVia?: PipelineVia;
  },
  set: (partial: Record<string, unknown>) => void,
  patch: Partial<ChainSlice>,
  extra?: { statusMessage?: string },
) {
  const s = get();
  const p = activeExtra(s);
  if (!p) {
    const next = { ...s, ...patch };
    const liveChain = pushLiveFx(next);
    set({ ...patch, liveChain, ...extra });
    return;
  }
  const extraPipelines = s.extraPipelines.map((x) => {
    if (x.id !== p.id) return x;
    const merged: ExtraPipeline = {
      ...x,
      ...patch,
      cableInserts: patch.cableInserts ?? x.cableInserts ?? [],
      deviceInserts: patch.deviceInserts ?? x.deviceInserts ?? [],
      aiVoice: patch.aiVoice !== undefined ? patch.aiVoice : x.aiVoice,
      spectrumFilters: patch.spectrumFilters ?? x.spectrumFilters,
      obsInserts: patch.obsInserts ?? x.obsInserts,
      liveChain: patch.liveChain ?? x.liveChain,
    };
    return {
      ...merged,
      liveChain: patch.liveChain ?? pipeSlots(merged),
    };
  });
  const liveChain = pushLiveFx({ ...s, extraPipelines });
  set({ extraPipelines, liveChain, ...extra });
}

function makeTrack(partial?: Partial<Track>): Track {
  const id = partial?.id ?? uid();
  const index = Math.abs(
    id.split("").reduce((a, c) => a + c.charCodeAt(0), 0),
  );
  return {
    id,
    name: partial?.name ?? "トラック",
    kind: partial?.kind ?? "other",
    buffer: partial?.buffer ?? null,
    undoBuffer: partial?.undoBuffer ?? null,
    offset: partial?.offset ?? 0,
    volume: partial?.volume ?? 1,
    pan: partial?.pan ?? 0,
    muted: partial?.muted ?? false,
    solo: partial?.solo ?? false,
    color: partial?.color ?? TRACK_COLORS[index % TRACK_COLORS.length]!,
    midiNotes: partial?.midiNotes,
    midiSourceNotes: partial?.midiSourceNotes,
    midiInstrument: partial?.midiInstrument ?? "piano",
    pitchEdit: partial?.pitchEdit,
    pitchSourceBuffer: partial?.pitchSourceBuffer,
  };
}

let ytClockRaf = 0;
let ytKeepAt = 0;
let liveMeterRaf = 0;
let rangeRaf = 0;
let deviceUnsub: (() => void) | null = null;
let midiRenderTimer = 0;
let notePreviewTimer = 0;

function scheduleNotePreview(
  get: () => EditorState,
  trackId: string,
  noteId: string,
) {
  if (typeof window === "undefined") return;
  window.clearTimeout(notePreviewTimer);
  try {
    getAudioEngine().stopPreview();
  } catch {
    /* not ready */
  }
  notePreviewTimer = window.setTimeout(() => {
    const state = get();
    if (state.status === "playing" || state.status === "recording") return;
    const track = state.tracks.find((t) => t.id === trackId);
    const note = (track?.midiNotes ?? []).find((n) => n.id === noteId);
    if (!track || !note) return;
    try {
      const engine = getAudioEngine();
      if (track.pitchEdit && track.pitchSourceBuffer) {
        const dur = Math.max(0.04, note.duration);
        const cap = Math.min(2, dur);
        const srcDur = Math.max(0.03, note.sourceDuration ?? dur);
        const sliced = {
          ...note,
          duration: cap,
          sourceDuration: srcDur * (cap / dur),
        };
        const buf = renderOnePitchBar(track.pitchSourceBuffer, sliced);
        engine.previewAudioBuffer(buf, cap);
      } else {
        engine.previewSynthNote({
          midi: note.midi,
          duration: note.duration,
          velocity: note.velocity,
          instrument: track.midiInstrument ?? state.midiInstrument,
        });
      }
    } catch (e) {
      console.error(e);
    }
  }, 200);
}

function scheduleMidiBuffer(
  get: () => EditorState,
  set: (p: Partial<EditorState>) => void,
  trackId: string,
) {
  if (typeof window === "undefined") return;
  window.clearTimeout(midiRenderTimer);
  midiRenderTimer = window.setTimeout(() => {
    const track = get().tracks.find((t) => t.id === trackId);
    if (!track) return;
    const notes = track.midiNotes ?? [];
    void (async () => {
      try {
        const engine = getAudioEngine();
        if (track.pitchEdit) {
          const source = track.pitchSourceBuffer;
          if (!source) return;
          const buffer =
            notes.length === 0
              ? source
              : await renderPitchBars(source, notes, (p) =>
                  set({ midiConvertProgress: p }),
                );
          if (!get().tracks.find((t) => t.id === trackId)) return;
          get().updateTrack(trackId, { buffer });
          engine.updateDuration(get().tracks);
          set({ duration: engine.getDuration(), midiConvertProgress: 1 });
          return;
        }
        const inst = track.midiInstrument ?? get().midiInstrument;
        if (notes.length === 0) {
          get().updateTrack(trackId, { buffer: null });
          engine.updateDuration(get().tracks);
          set({ duration: engine.getDuration() });
          return;
        }
        const parsed = notesToParsed(notes, track.name);
        const buffer = await renderMidiToAudioBuffer(
          parsed,
          engine.getSampleRate(),
          inst,
        );
        if (!get().tracks.find((t) => t.id === trackId)) return;
        get().updateTrack(trackId, { buffer });
        engine.updateDuration(get().tracks);
        set({ duration: engine.getDuration() });
      } catch (e) {
        console.error(e);
      }
    })();
  }, 280);
}

let holdHz: number | null = null;
let holdStartedAt = 0;
const STABLE_MS = 300;
const CENTS_TOL = 40;

function stopYtClock() {
  if (ytClockRaf) {
    cancelAnimationFrame(ytClockRaf);
    ytClockRaf = 0;
  }
}

function stopLiveMeter() {
  if (liveMeterRaf) {
    cancelAnimationFrame(liveMeterRaf);
    liveMeterRaf = 0;
  }
}

function stopRangeLoop() {
  if (rangeRaf) {
    cancelAnimationFrame(rangeRaf);
    rangeRaf = 0;
  }
  holdHz = null;
  holdStartedAt = 0;
}

function hasAudioBuffers(tracks: Track[]) {
  return tracks.some((t) => !!t.buffer);
}

export interface EditorState {
  ready: boolean;
  tracks: Track[];
  activeTrackId: string | null;
  status: EngineStatus;
  currentTime: number;
  duration: number;
  bpm: number;
  master: MasterFx;
  statusMessage: string;
  isExporting: boolean;
  isSeparating: boolean;
  isLoadingMidi: boolean;
  isLoadingMedia: boolean;
  isConvertingMidi: boolean;
  midiConvertProgress: number;
  midiRhythmOnly: boolean;
  midiGrid: RhythmGrid;
  midiSnap: number;
  midiSwing: number;

  tapActive: boolean;
  tapSourceId: string | null;
  tapPitches: number[];
  tapGuideStarts: number[];
  tapRecorded: MidiNote[];
  tapIndex: number;
  tapHeld: boolean;
  tapFreeOriginMs: number | null;
  midiInstrument: MidiInstrumentId;
  midiEditTrackId: string | null;
  midiWindowBeat: number;
  midiDrawBeats: number;
  midiViewLow: number;
  midiCursorBeat: number;
  midiCursorPitch: number;
  midiUndo: { trackId: string; notes: MidiNote[] }[];
  loopEnabled: boolean;
  loopA: number | null;
  loopB: number | null;
  youtubeInput: string;
  youtubeVideoId: string | null;
  youtubeReady: boolean;
  youtubeSync: boolean;
  youtubePlayerEpoch: number;
  /** Mute YouTube audio because cancelled local file is the accompaniment. */
  youtubeMuteForCancel: boolean;
  /** Follow across tabs as a floating player. Default off. */
  youtubePinned: boolean;
  youtubeFloatX: number;
  youtubeFloatY: number;
  youtubeClips: YoutubeClip[];

  inputDevices: AudioDeviceInfo[];
  outputDevices: AudioDeviceInfo[];
  inputDeviceId: string;
  outputDeviceId: string;
  outputSelectSupported: boolean;
  devicesPermission: "unknown" | "granted" | "denied";
  devicesLoading: boolean;
  inputEnabled: boolean;
  outputEnabled: boolean;

  liveFxActive: boolean;
  liveFxBusy: boolean;
  liveLevel: number;

  roomProfile: RoomProfile | null;
  roomAmount: number;
  roomCapturing: boolean;
  roomCaptureProgress: number;

  voiceProfile: RoomProfile | null;
  voiceAmount: number;
  voiceCapturing: boolean;
  voiceCaptureProgress: number;

  spectrumFilters: SpectrumFilter[];
  obsInserts: ObsInsert[];
  aiVoice: AiVoiceInsert | null;
  cableInserts: CableInsert[];
  deviceInserts: DeviceIoInsert[];
  extraPipelines: ExtraPipeline[];
  activePipelineId: "main" | string;
  pipelineVia: PipelineVia;
  liveChain: LiveSlot[];

  rangeMeasuring: boolean;
  rangeBusy: boolean;
  rangeCurrentHz: number | null;
  rangeCurrentNote: string | null;
  rangeCurrentConfidence: number;
  rangeMinHz: number | null;
  rangeMaxHz: number | null;
  rangeMinNote: string | null;
  rangeMaxNote: string | null;
  rangeStable: boolean;
  rangeHoldProgress: number;

  /** Offline analysis of input media (e.g. after vocal isolation) */
  mediaRangeAnalyzing: boolean;
  mediaRangeProgress: number;
  mediaRangeResult: MediaRangeResult | null;
  mediaRangeTrackId: string | null;

  initEngine: () => void;
  setBpm: (n: number) => void;
  setStatusMessage: (msg: string) => void;
  setActiveTrack: (id: string | null) => void;
  addTrack: (opts?: { name?: string; kind?: TrackKind }) => string;
  removeTrack: (id: string) => void;
  renameTrack: (id: string, name: string) => void;
  updateTrack: (id: string, patch: Partial<Track>) => void;
  toggleMute: (id: string) => void;
  toggleSolo: (id: string) => void;
  loadFileToTrack: (id: string | null, file: File) => Promise<void>;
  loadMidiToTrack: (id: string | null, file: File) => Promise<void>;
  convertTrackToMidi: (id?: string) => Promise<void>;
  extractPitchBars: (id?: string) => Promise<void>;
  applyRhythmToMidiTrack: (id?: string) => Promise<void>;
  setMidiRhythmOnly: (on: boolean) => void;
  setMidiGrid: (g: RhythmGrid) => void;
  setMidiSnap: (n: number) => void;
  setMidiSwing: (n: number) => void;
  startTapRhythm: (id?: string) => void;
  cancelTapRhythm: () => void;
  finishTapRhythm: () => Promise<void>;
  tapDown: () => void;
  tapUp: () => void;
  setMidiInstrument: (id: MidiInstrumentId) => void;
  setTrackMidiInstrument: (trackId: string, id: MidiInstrumentId) => Promise<void>;
  rebakeMidiTracks: () => Promise<void>;
  openMidiEditor: (trackId: string | null) => void;
  createMidiTrack: () => string;
  setMidiWindowBeat: (beat: number) => void;
  setMidiDrawBeats: (beats: number) => void;
  shiftMidiViewOctave: (delta: -1 | 1) => void;
  setMidiCursor: (beat: number, pitch: number) => void;
  toggleMidiCell: (
    trackId: string,
    beat: number,
    pitch: number,
    mode?: "add" | "delete",
  ) => void;
  patchMidiNote: (
    trackId: string,
    noteId: string,
    patch: Partial<MidiNote>,
    bake?: boolean,
  ) => void;
  captureMidiUndo: (trackId: string) => void;
  undoMidiEdit: () => void;
  seekToBeat: (beat: number) => void;
  seek: (time: number) => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  togglePlay: () => void;
  startRecord: () => Promise<void>;
  stopRecord: () => Promise<void>;
  toggleRecord: () => Promise<void>;
  setMaster: (patch: Partial<MasterFx>) => void;
  applyPreset: (id: MixPresetId) => void;
  exportWav: () => Promise<void>;
  setLoopPoint: (which: "a" | "b" | "clear") => void;
  setYoutubeInput: (v: string) => void;
  loadYoutube: (videoId: string, source?: string) => void;
  clearYoutube: () => void;
  removeYoutubeClip: (id: string) => void;
  setYoutubeReady: (ready: boolean, clipId?: string) => void;
  setYoutubeSync: (sync: boolean) => void;
  setYoutubeClipSync: (id: string, sync: boolean) => void;
  setYoutubeClipMuted: (id: string, muted: boolean) => void;
  setYoutubePinned: (on: boolean, clipId?: string) => void;
  toggleYoutubePinned: (clipId?: string) => void;
  setYoutubeFloatPos: (x: number, y: number, clipId?: string) => void;
  setYoutubeFloatSize: (w: number, clipId?: string) => void;
  applySeparation: (mode: SeparationMode) => Promise<void>;
  loadFileForYoutubeCancel: (
    file: File,
    mode: SeparationMode,
  ) => Promise<void>;
  restoreTrackBuffer: (id?: string) => void;
  refreshAudioDevices: (opts?: {
    requestPermission?: boolean;
  }) => Promise<void>;
  setInputDevice: (deviceId: string) => void;
  setOutputDevice: (deviceId: string) => Promise<void>;
  setInputEnabled: (enabled: boolean) => void;
  setOutputEnabled: (enabled: boolean) => void;
  toggleInputEnabled: () => void;
  toggleOutputEnabled: () => void;
  startLiveFx: () => Promise<void>;
  stopLiveFx: () => void;
  toggleLiveFx: () => Promise<void>;
  captureRoomProfile: () => Promise<void>;
  clearRoomProfile: () => void;
  setRoomAmount: (n: number) => void;
  captureVoiceProfile: () => Promise<void>;
  clearVoiceProfile: () => void;
  setVoiceAmount: (n: number) => void;
  addSpectrumFilter: (kind: SpectrumFilterKind, hz: number) => string | null;
  updateSpectrumFilter: (id: string, patch: Partial<SpectrumFilter>) => void;
  removeSpectrumFilter: (id: string) => void;
  toggleSpectrumFilter: (id: string) => void;
  moveSpectrumFilter: (id: string, delta: -1 | 1) => void;
  replaceSpectrumFilters: (filters: SpectrumFilter[]) => void;
  addObsInsert: (kind: ObsFilterId) => string | null;
  updateObsInsert: (id: string, patch: Partial<ObsInsert>) => void;
  removeObsInsert: (id: string) => void;
  toggleObsInsert: (id: string) => void;
  moveObsInsert: (id: string, delta: -1 | 1) => void;
  replaceObsInserts: (inserts: ObsInsert[]) => void;
  addAiVoice: () => string | null;
  updateAiVoice: (patch: Partial<AiVoiceInsert>) => void;
  removeAiVoice: () => void;
  toggleAiVoice: () => void;
  addCableInsert: (kind: CableKind) => string | null;
  updateCableInsert: (id: string, patch: Partial<CableInsert>) => void;
  removeCableInsert: (id: string) => void;
  toggleCableInsert: (id: string) => void;
  addDeviceInsert: (kind: DeviceIoKind) => string | null;
  updateDeviceInsert: (id: string, patch: Partial<DeviceIoInsert>) => void;
  removeDeviceInsert: (id: string) => void;
  toggleDeviceInsert: (id: string) => void;
  addExtraPipeline: () => string | null;
  updateExtraPipeline: (id: string, patch: Partial<ExtraPipeline>) => void;
  removeExtraPipeline: (id: string) => void;
  setPipelineVia: (via: PipelineVia) => void;
  setActivePipelineId: (id: "main" | string) => void;
  addPipelineSpectrum: (
    pipeId: string,
    kind: SpectrumFilterKind,
    hz: number,
  ) => string | null;
  addPipelineObs: (pipeId: string, kind: ObsFilterId) => string | null;
  removePipelineItem: (pipeId: string, itemId: string) => void;
  togglePipelineItem: (pipeId: string, itemId: string) => void;
  moveLiveSlot: (id: string, delta: -1 | 1) => void;
  applyFxSnapshot: (snap: FxSnapshot) => void;
  captureFxSnapshot: (name: string) => FxSnapshot;
  startRangeTest: () => Promise<void>;
  stopRangeTest: () => void;
  resetRangeTest: () => void;
  setMediaRangeTrackId: (id: string | null) => void;
  analyzeMediaRange: (opts?: {
    trackId?: string;
    /** 音源キャンセル（センターボーカル抽出）してから解析 */
    isolateVocals?: boolean;
  }) => Promise<void>;
  clearMediaRangeResult: () => void;
}

function clipDerived(clips: YoutubeClip[]) {
  const p = clips[0];
  return {
    youtubeClips: clips,
    youtubeVideoId: p?.videoId ?? null,
    youtubeReady: clips.some((c) => c.ready),
    youtubePinned: clips.some((c) => c.pinned),
    youtubePlayerEpoch: p?.epoch ?? 0,
    youtubeFloatX: p?.floatX ?? 16,
    youtubeFloatY: p?.floatY ?? 96,
  };
}

function syncedClipIds(s: { youtubeSync: boolean; youtubeClips: YoutubeClip[] }) {
  if (!s.youtubeSync) return [] as string[];
  return s.youtubeClips.filter((c) => c.sync).map((c) => c.id);
}

function applyYoutubeMutes(s: {
  outputEnabled: boolean;
  youtubeMuteForCancel: boolean;
  youtubeClips: YoutubeClip[];
}) {
  for (const c of s.youtubeClips) {
    const mute =
      !s.outputEnabled || c.muted || (s.youtubeMuteForCancel && c.sync);
    youtubeSetMuted(mute, [c.id]);
  }
}

function startYtClock(
  get: () => EditorState,
  set: (p: Partial<EditorState>) => void,
) {
  stopYtClock();
  const tick = () => {
    const s = get();
    if (s.status !== "playing" && s.status !== "recording") {
      stopYtClock();
      return;
    }
    if (!s.youtubeSync || !s.youtubeVideoId || !isYouTubePlayerReady()) {
      ytClockRaf = requestAnimationFrame(tick);
      return;
    }

    const ids = syncedClipIds(s);
    const ytTime = youtubeGetCurrentTime(ids);
    const ytDur = youtubeGetDuration(ids);
    const audioOnly = hasAudioBuffers(s.tracks);

    if (!audioOnly) {
      set({
        currentTime: ytTime,
        duration: Math.max(s.duration, ytDur),
      });
    } else if (ytDur > 0 && ytDur > s.duration) {
      set({ duration: ytDur });
    }

    const now = typeof performance !== "undefined" ? performance.now() : 0;
    if (now - ytKeepAt > 200) {
      ytKeepAt = now;
      youtubeKeepPlaying(ids);
    }

    ytClockRaf = requestAnimationFrame(tick);
  };
  ytClockRaf = requestAnimationFrame(tick);
}

function startLiveMeterPoll(
  get: () => EditorState,
  set: (p: Partial<EditorState>) => void,
) {
  stopLiveMeter();
  const tick = () => {
    if (!get().liveFxActive && get().status !== "recording") {
      set({ liveLevel: 0 });
      stopLiveMeter();
      return;
    }
    try {
      set({ liveLevel: getAudioEngine().getLiveLevel() });
    } catch {
      /* noop */
    }
    liveMeterRaf = requestAnimationFrame(tick);
  };
  liveMeterRaf = requestAnimationFrame(tick);
}

function startRangeLoop(
  get: () => EditorState,
  set: (p: Partial<EditorState>) => void,
) {
  stopRangeLoop();
  const tick = () => {
    if (!get().rangeMeasuring) {
      stopRangeLoop();
      return;
    }
    try {
      const engine = getAudioEngine();
      const buf = engine.readPitchTimeDomain();
      const sr = engine.getSampleRate();
      if (!buf) {
        rangeRaf = requestAnimationFrame(tick);
        return;
      }
      const detected = detectPitch(buf, sr);
      const now = performance.now();

      if (!detected) {
        holdHz = null;
        holdStartedAt = 0;
        set({
          rangeCurrentHz: null,
          rangeCurrentNote: null,
          rangeCurrentConfidence: 0,
          rangeStable: false,
          rangeHoldProgress: 0,
        });
        rangeRaf = requestAnimationFrame(tick);
        return;
      }

      const note = midiToNoteName(hzToMidi(detected.hz));
      let stable = false;
      let progress = 0;

      if (
        holdHz != null &&
        Math.abs(centsBetween(detected.hz, holdHz)) <= CENTS_TOL
      ) {
        progress = Math.min(1, (now - holdStartedAt) / STABLE_MS);
        if (now - holdStartedAt >= STABLE_MS) {
          stable = true;
          const ref = holdHz;
          const s = get();
          let minHz = s.rangeMinHz;
          let maxHz = s.rangeMaxHz;
          if (minHz == null || ref < minHz) minHz = ref;
          if (maxHz == null || ref > maxHz) maxHz = ref;
          set({
            rangeMinHz: minHz,
            rangeMaxHz: maxHz,
            rangeMinNote:
              minHz != null ? midiToNoteName(hzToMidi(minHz)) : null,
            rangeMaxNote:
              maxHz != null ? midiToNoteName(hzToMidi(maxHz)) : null,
          });
        }
      } else {
        holdHz = detected.hz;
        holdStartedAt = now;
        progress = 0;
      }

      set({
        rangeCurrentHz: detected.hz,
        rangeCurrentNote: note,
        rangeCurrentConfidence: detected.confidence,
        rangeStable: stable,
        rangeHoldProgress: progress,
      });
    } catch {
      /* ignore frame errors */
    }
    rangeRaf = requestAnimationFrame(tick);
  };
  rangeRaf = requestAnimationFrame(tick);
}

function syncYoutubePlay(get: () => EditorState) {
  const s = get();
  const ids = syncedClipIds(s);
  if (!ids.length || !ids.some((id) => isYouTubePlayerReady(id))) return false;
  applyYoutubeMutes(s);
  // Play first in the same user-gesture tick. Seek after — seekTo often
  // swallows a playVideo issued in the same moment.
  const ok = youtubePlay(ids);
  if (s.currentTime > 0.2) {
    youtubeSeek(s.currentTime, ids);
    window.setTimeout(() => youtubePlay(ids), 120);
  }
  return ok;
}

function syncYoutubePause(get: () => EditorState) {
  const s = get();
  const ids = syncedClipIds(s);
  if (!ids.length) return;
  youtubePause(ids);
}

function syncYoutubeStop(get: () => EditorState) {
  const s = get();
  const ids = syncedClipIds(s);
  if (!ids.length) return;
  youtubeStop(ids);
}

export const useEditorStore = create<EditorState>((set, get) => ({
  ready: false,
  tracks: [],
  activeTrackId: null,
  status: "idle",
  currentTime: 0,
  duration: 0,
  bpm: 120,
  master: { ...DEFAULT_MASTER_FX },
  statusMessage: "準備完了",
  isExporting: false,
  isSeparating: false,
  isLoadingMidi: false,
  isLoadingMedia: false,
  isConvertingMidi: false,
  midiConvertProgress: 0,
  midiRhythmOnly: false,
  midiGrid: 8,
  midiSnap: 0.85,
  midiSwing: 0,

  tapActive: false,
  tapSourceId: null,
  tapPitches: [],
  tapGuideStarts: [],
  tapRecorded: [],
  tapIndex: 0,
  tapHeld: false,
  tapFreeOriginMs: null,
  midiInstrument: DEFAULT_MIDI_INSTRUMENT,
  midiEditTrackId: null,
  midiWindowBeat: 0,
  midiDrawBeats: 1,
  midiViewLow: 48,
  midiCursorBeat: 0,
  midiCursorPitch: 60,
  midiUndo: [],
  loopEnabled: false,
  loopA: null,
  loopB: null,
  youtubeInput: "",
  youtubeVideoId: null,
  youtubeReady: false,
  youtubeSync: true,
  youtubePlayerEpoch: 0,
  youtubeMuteForCancel: false,
  youtubePinned: false,
  youtubeFloatX: 16,
  youtubeFloatY: 96,
  youtubeClips: [],

  inputDevices: [],
  outputDevices: [],
  inputDeviceId: "",
  outputDeviceId: "",
  outputSelectSupported: false,
  devicesPermission: "unknown",
  devicesLoading: false,
  inputEnabled: true,
  outputEnabled: true,

  liveFxActive: false,
  liveFxBusy: false,
  liveLevel: 0,

  roomProfile: null,
  roomAmount: 0,
  roomCapturing: false,
  roomCaptureProgress: 0,

  voiceProfile: null,
  voiceAmount: 0,
  voiceCapturing: false,
  voiceCaptureProgress: 0,

  spectrumFilters: [],
  obsInserts: [],
  aiVoice: null,
  cableInserts: [],
  deviceInserts: [],
  extraPipelines: [],
  activePipelineId: "main",
  pipelineVia: "main",
  liveChain: [],

  rangeMeasuring: false,
  rangeBusy: false,
  rangeCurrentHz: null,
  rangeCurrentNote: null,
  rangeCurrentConfidence: 0,
  rangeMinHz: null,
  rangeMaxHz: null,
  rangeMinNote: null,
  rangeMaxNote: null,
  rangeStable: false,
  rangeHoldProgress: 0,

  mediaRangeAnalyzing: false,
  mediaRangeProgress: 0,
  mediaRangeResult: null,
  mediaRangeTrackId: null,

  initEngine: () => {
    if (get().ready || typeof window === "undefined") return;
    const engine = getAudioEngine();
    engine.setHandlers({
      onTick: (snap) => {
        if (
          hasAudioBuffers(get().tracks) ||
          snap.status === "recording"
        ) {
          set({
            currentTime: snap.currentTime,
            duration: Math.max(snap.duration, get().duration),
            status: snap.status,
          });
        } else {
          set({ status: snap.status });
        }
      },
      onStatus: (status) => {
        const prev = get().status;
        set({ status });
        if (status === "idle" && prev === "playing") {
          syncYoutubePause(get);
          stopYtClock();
        }
      },
    });
    engine.applyMasterFx(get().master);
    pushLiveFx(get());
    engine.setInputEnabled(get().inputEnabled);
    engine.setOutputEnabled(get().outputEnabled);

    set({
      outputSelectSupported:
        supportsOutputSinkSelection() || engine.supportsOutputSelection(),
    });

    setYouTubeEndedHandler((clipId) => {
      const s = get();
      const ids = syncedClipIds(s);
      if (ids.length && clipId && ids[0] !== clipId) return;
      if (!hasAudioBuffers(s.tracks) && s.status === "playing") {
        get().pause();
        set({ statusMessage: "YouTube 再生が終了しました" });
      }
    });

    if (!deviceUnsub) {
      deviceUnsub = subscribeDeviceChanges(() => {
        void get().refreshAudioDevices({ requestPermission: false });
      });
    }

    if (get().tracks.length === 0) {
      const vocal = makeTrack({ name: "ボーカル", kind: "vocal" });
      const acmp = makeTrack({ name: "伴奏", kind: "accompaniment" });
      set({
        tracks: [vocal, acmp],
        activeTrackId: acmp.id,
        ready: true,
        statusMessage: "Fuwari REC へようこそ",
      });
    } else {
      set({ ready: true });
    }

    void get().refreshAudioDevices({ requestPermission: false });
  },

  setBpm: (n) => set({ bpm: Math.max(40, Math.min(300, n)) }),
  setStatusMessage: (msg) => set({ statusMessage: msg }),
  setActiveTrack: (id) => set({ activeTrackId: id }),

  addTrack: (opts) => {
    const track = makeTrack({
      name: opts?.name ?? `トラック ${get().tracks.length + 1}`,
      kind: opts?.kind ?? "other",
    });
    set((s) => ({
      tracks: [...s.tracks, track],
      activeTrackId: track.id,
      statusMessage: `${track.name} を追加`,
    }));
    return track.id;
  },

  removeTrack: (id) => {
    set((s) => {
      const tracks = s.tracks.filter((t) => t.id !== id);
      const activeTrackId =
        s.activeTrackId === id ? (tracks[0]?.id ?? null) : s.activeTrackId;
      const engine = getAudioEngine();
      engine.updateDuration(tracks);
      return {
        tracks,
        activeTrackId,
        duration: engine.getDuration(),
        statusMessage: "トラックを削除",
        midiEditTrackId: s.midiEditTrackId === id ? null : s.midiEditTrackId,
        mediaRangeTrackId:
          s.mediaRangeTrackId === id ? null : s.mediaRangeTrackId,
      };
    });
  },

  renameTrack: (id, name) => {
    set((s) => ({
      tracks: s.tracks.map((t) =>
        t.id === id ? { ...t, name: name || t.name } : t,
      ),
    }));
  },

  updateTrack: (id, patch) => {
    set((s) => {
      const tracks = s.tracks.map((t) =>
        t.id === id ? { ...t, ...patch, id: t.id } : t,
      );
      const track = tracks.find((t) => t.id === id);
      if (track) {
        try {
          getAudioEngine().updateLiveTrackParams(track);
        } catch {
          /* not ready */
        }
      }
      try {
        const engine = getAudioEngine();
        engine.updateDuration(tracks);
        return { tracks, duration: engine.getDuration() };
      } catch {
        return { tracks };
      }
    });
  },

  toggleMute: (id) => {
    const t = get().tracks.find((x) => x.id === id);
    if (!t) return;
    get().updateTrack(id, { muted: !t.muted });
  },

  toggleSolo: (id) => {
    const t = get().tracks.find((x) => x.id === id);
    if (!t) return;
    get().updateTrack(id, { solo: !t.solo });
  },

  loadFileToTrack: async (id, file) => {
    if (isMidiFile(file)) {
      await get().loadMidiToTrack(id, file);
      return;
    }
    if (get().isLoadingMedia) return;
    const fromVideo = isVideoFile(file);
    set({
      isLoadingMedia: true,
      statusMessage: fromVideo
        ? `動画から音声を抽出中… ${file.name}`
        : `読み込み中… ${file.name}`,
    });
    try {
      if (get().status === "playing") get().pause();
      const engine = getAudioEngine();
      const buffer = await engine.decodeFile(file);
      let trackId = id;
      if (!trackId) {
        trackId = get().addTrack({
          name: file.name.replace(/\.[^/.]+$/, "") || "読み込み",
          kind: "accompaniment",
        });
      }
      const baseName = file.name.replace(/\.[^/.]+$/, "");
      get().updateTrack(trackId, {
        buffer,
        undoBuffer: null,
        name: baseName || get().tracks.find((t) => t.id === trackId)?.name,
        offset: 0,
      });
      engine.updateDuration(get().tracks);
      set({
        duration: engine.getDuration(),
        statusMessage: fromVideo
          ? `動画から音声を取り込みました: ${file.name}`
          : `読み込み完了: ${file.name}`,
        activeTrackId: trackId,
        mediaRangeTrackId: trackId,
      });
    } catch (e) {
      console.error(e);
      set({
        statusMessage:
          e instanceof Error
            ? e.message
            : "ファイルの読み込みに失敗しました（音声トラックがあるか確認してください）",
      });
    } finally {
      set({ isLoadingMedia: false });
    }
  },

  loadMidiToTrack: async (id, file) => {
    if (get().isLoadingMidi) return;
    set({ isLoadingMidi: true, statusMessage: `MIDI 変換中… ${file.name}` });
    try {
      if (get().status === "playing") get().pause();
      const ab = await file.arrayBuffer();
      const parsed = parseMidi(ab);
      const parts = midiPartsFromParsed(parsed);
      const noteCount = parts.reduce((n, p) => n + p.notes.length, 0);
      if (noteCount === 0) {
        set({ statusMessage: "MIDI に再生できるノートがありません" });
        return;
      }
      const engine = getAudioEngine();
      const sampleRate = engine.getSampleRate();
      const fileBase =
        parsed.name || file.name.replace(/\.[^/.]+$/, "") || "MIDI";
      const existing = id ? get().tracks.find((t) => t.id === id) : null;
      const reuse =
        Boolean(existing) &&
        !existing?.buffer &&
        !(existing?.midiNotes?.length);
      const created: string[] = [];
      const timeline = Math.max(parsed.duration, 0.2);

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]!;
        const inst = instrumentFromGm(part.program, part.channel);
        set({
          statusMessage: `MIDI 変換中… ${i + 1}/${parts.length} ${file.name}`,
        });
        const buffer = await renderMidiToAudioBuffer(
          {
            notes: part.notes,
            duration: timeline,
            ticksPerQuarter: parsed.ticksPerQuarter,
            name: part.name,
            format: parsed.format,
            tracks: [part],
          },
          sampleRate,
          inst,
        );
        const label =
          part.name?.trim() ||
          (parts.length > 1 ? `${fileBase} · ${i + 1}` : fileBase);
        let trackId: string;
        if (i === 0 && reuse && id) {
          trackId = id;
        } else {
          trackId = get().addTrack({
            name: `MIDI · ${label}`,
            kind: "midi",
          });
        }
        get().updateTrack(trackId, {
          buffer,
          undoBuffer: null,
          name: `MIDI · ${label}`,
          kind: "midi",
          offset: 0,
          midiNotes: part.notes,
          midiSourceNotes: part.notes,
          midiInstrument: inst,
        });
        created.push(trackId);
      }

      const firstId = created[0]!;
      const firstNotes = parts[0]!.notes;
      engine.updateDuration(get().tracks);
      set({
        duration: engine.getDuration(),
        activeTrackId: firstId,
        mediaRangeTrackId: firstId,
        midiEditTrackId: firstId,
        midiViewLow: centerViewLow(firstNotes),
        midiWindowBeat: 0,
        statusMessage:
          parts.length > 1
            ? `MIDI を ${parts.length} トラックに展開しました（${noteCount} ノート）`
            : `MIDI 読み込み完了: MIDI · ${fileBase}（${noteCount} ノート）— ピアノロールで編集できます`,
      });
    } catch (e) {
      console.error(e);
      set({
        statusMessage:
          e instanceof Error ? e.message : "MIDI の読み込みに失敗しました",
      });
    } finally {
      set({ isLoadingMidi: false });
    }
  },

  convertTrackToMidi: async (id) => {
    if (get().isConvertingMidi) return;
    const tracks = get().tracks;
    const track =
      tracks.find((t) => t.id === (id ?? get().activeTrackId)) ??
      tracks.find((t) => t.buffer) ??
      null;
    if (!track?.buffer) {
      set({ statusMessage: "MIDI 化する音源がありません。先に録音するか読み込んでください" });
      return;
    }
    if (get().status === "playing") get().pause();
    set({
      isConvertingMidi: true,
      midiConvertProgress: 0,
      statusMessage: `歌を MIDI 化中… ${track.name}`,
    });
    try {
      const result = await melodyFromBuffer(track.buffer, {
        bpm: get().bpm,
        name: `${track.name} メロディ`,
        minHz: get().rangeMinHz ?? 70,
        maxHz: get().rangeMaxHz ?? 1000,
        onProgress: (p) => set({ midiConvertProgress: p }),
      });
      if (result.notes.length === 0) {
        set({
          statusMessage:
            "安定した音程が取れませんでした。もう少しはっきり歌うか、ボーカルだけにしてから試してください",
        });
        return;
      }
      let notes = result.notes;
      const name = `${track.name} メロディ`;
      if (get().midiRhythmOnly) {
        notes = applyRhythmOnly(notes, {
          bpm: get().bpm,
          grid: get().midiGrid,
          strength: get().midiSnap,
          swing: get().midiSwing,
        });
      }
      const parsed = notesToParsed(notes, name);
      const engine = getAudioEngine();
      const inst = get().midiInstrument;
      const buffer = await renderMidiToAudioBuffer(
        parsed,
        engine.getSampleRate(),
        inst,
      );
      const midiId = get().addTrack({
        name: get().midiRhythmOnly
          ? `MIDI · ${track.name}（リズム）`
          : `MIDI · ${track.name}`,
        kind: "midi",
      });
      get().updateTrack(midiId, {
        buffer,
        undoBuffer: null,
        offset: track.offset,
        midiNotes: notes,
        midiSourceNotes: result.notes,
        midiInstrument: inst,
        kind: "midi",
      });
      engine.updateDuration(get().tracks);
      const midBytes = new Uint8Array(
        encodeMidiFile(notes, { bpm: get().bpm, name, instrument: inst }),
      );
      const mid = new Blob([midBytes], { type: "audio/midi" });
      const safe = track.name.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 48);
      downloadBlob(mid, `${safe || "fuwari-melody"}.mid`);
      set({
        duration: engine.getDuration(),
        activeTrackId: midiId,
        midiEditTrackId: midiId,
        midiViewLow: centerViewLow(notes),
        midiWindowBeat: 0,
        midiConvertProgress: 1,
        statusMessage: get().midiRhythmOnly
          ? `音程はそのまま、リズムを合わせました（${melodySummary(notes)}）`
          : `MIDI 化しました（${melodySummary(notes)}）。ピアノロールで直せます`,
      });
    } catch (e) {
      console.error(e);
      set({
        statusMessage:
          e instanceof Error ? e.message : "MIDI 化に失敗しました",
      });
    } finally {
      set({ isConvertingMidi: false });
    }
  },

  extractPitchBars: async (id) => {
    if (get().isConvertingMidi) return;
    const tracks = get().tracks;
    const track =
      tracks.find((t) => t.id === (id ?? get().activeTrackId)) ??
      tracks.find((t) => t.buffer && t.kind !== "midi") ??
      null;
    if (!track?.buffer) {
      set({
        statusMessage:
          "切り出す音源がありません。先に録音するか読み込んでください",
      });
      return;
    }
    if (get().status === "playing") get().pause();
    set({
      isConvertingMidi: true,
      midiConvertProgress: 0,
      statusMessage: `音階をバーに切り出し中… ${track.name}`,
    });
    try {
      const result = await melodyFromBuffer(track.buffer, {
        bpm: get().bpm,
        name: track.name,
        minHz: get().rangeMinHz ?? 70,
        maxHz: get().rangeMaxHz ?? 1000,
        onProgress: (p) => set({ midiConvertProgress: p }),
      });
      if (result.notes.length === 0) {
        set({
          statusMessage:
            "安定した音程が取れませんでした。もう少しはっきり歌うか、ボーカルだけにしてから試してください",
        });
        return;
      }
      const notes = stampPitchSources(result.notes);
      const engine = getAudioEngine();
      const source = cloneAudioBuffer(track.buffer, engine.getContext());
      get().updateTrack(track.id, {
        midiNotes: notes,
        midiSourceNotes: notes,
        pitchEdit: true,
        pitchSourceBuffer: source,
        undoBuffer: track.undoBuffer ?? source,
      });
      engine.updateDuration(get().tracks);
      set({
        duration: engine.getDuration(),
        activeTrackId: track.id,
        midiEditTrackId: track.id,
        midiViewLow: centerViewLow(notes),
        midiWindowBeat: 0,
        midiConvertProgress: 1,
        midiUndo: [],
        statusMessage: `${melodySummary(notes)} をバーにしました。上下で音程、右端で長さを直せます`,
      });
    } catch (e) {
      console.error(e);
      set({
        statusMessage:
          e instanceof Error ? e.message : "音階の切り出しに失敗しました",
      });
    } finally {
      set({ isConvertingMidi: false });
    }
  },

  setMidiRhythmOnly: (on) => set({ midiRhythmOnly: on }),
  setMidiGrid: (g) => set({ midiGrid: g }),
  setMidiSnap: (n) => set({ midiSnap: Math.max(0, Math.min(1, n)) }),
  setMidiSwing: (n) => set({ midiSwing: Math.max(0, Math.min(1, n)) }),

  applyRhythmToMidiTrack: async (id) => {
    if (get().isConvertingMidi) return;
    const tracks = get().tracks;
    const track =
      tracks.find((t) => t.id === (id ?? get().activeTrackId)) ?? null;
    const source = track?.midiSourceNotes ?? track?.midiNotes;
    if (!track || !source?.length) {
      set({
        statusMessage:
          "リズムを変える MIDI がありません。先に歌を MIDI 化するか、.mid を読み込んでください",
      });
      return;
    }
    if (get().status === "playing") get().pause();
    set({ isConvertingMidi: true, statusMessage: "リズムだけ整えています…" });
    try {
      const notes = applyRhythmOnly(source, {
        bpm: get().bpm,
        grid: get().midiGrid,
        strength: get().midiSnap,
        swing: get().midiSwing,
      });
      if (track.pitchEdit) {
        get().updateTrack(track.id, { midiNotes: stampPitchSources(notes) });
        set({
          statusMessage: `リズムを寄せました（声のまま）${melodySummary(notes)}`,
        });
        scheduleMidiBuffer(get, set, track.id);
        return;
      }
      const name = track.name.replace(/（リズム）$/, "") + "（リズム）";
      const parsed = notesToParsed(notes, name);
      const engine = getAudioEngine();
      const inst = track.midiInstrument ?? get().midiInstrument;
      const buffer = await renderMidiToAudioBuffer(
        parsed,
        engine.getSampleRate(),
        inst,
      );
      get().updateTrack(track.id, {
        buffer,
        midiNotes: notes,
        name,
        midiInstrument: inst,
      });
      engine.updateDuration(get().tracks);
      const midBytes = new Uint8Array(
        encodeMidiFile(notes, { bpm: get().bpm, name, instrument: inst }),
      );
      downloadBlob(
        new Blob([midBytes], { type: "audio/midi" }),
        `${name.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 48)}.mid`,
      );
      set({
        duration: engine.getDuration(),
        statusMessage: `音程はそのまま、リズムを合わせました（${melodySummary(notes)}）`,
      });
    } catch (e) {
      console.error(e);
      set({
        statusMessage:
          e instanceof Error ? e.message : "リズムの適用に失敗しました",
      });
    } finally {
      set({ isConvertingMidi: false });
    }
  },

  startTapRhythm: (id) => {
    const tracks = get().tracks;
    const track =
      tracks.find((t) => t.id === (id ?? get().activeTrackId)) ??
      tracks.find((t) => (t.midiNotes?.length ?? 0) > 0) ??
      null;
    const notes = track?.midiSourceNotes ?? track?.midiNotes;
    if (!track || !notes?.length) {
      set({
        statusMessage:
          "タップする音程譜がありません。先に歌を MIDI 化するか、.mid を読み込んでください",
      });
      return;
    }
    const ordered = [...notes].sort((a, b) => a.start - b.start);
    if (get().status === "recording") return;
    try {
      const engine = getAudioEngine();
      engine.tapNoteOff();
      engine.setTapInstrument(track.midiInstrument ?? get().midiInstrument);
    } catch {
      /* noop */
    }
    set({
      tapActive: true,
      tapSourceId: track.id,
      tapPitches: ordered.map((n) => n.midi),
      tapGuideStarts: ordered.map((n) => n.start + track.offset),
      tapRecorded: [],
      tapIndex: 0,
      tapHeld: false,
      tapFreeOriginMs: null,
      statusMessage:
        "タップ演奏 — スペース／画面を叩くと次の音程が鳴ります。終わったら記録してトラックに",
    });
    get().updateTrack(track.id, { muted: true });
  },

  cancelTapRhythm: () => {
    const { tapSourceId, tapHeld } = get();
    if (tapHeld) {
      try {
        getAudioEngine().tapNoteOff();
      } catch {
        /* noop */
      }
    }
    if (tapSourceId) {
      const src = get().tracks.find((t) => t.id === tapSourceId);
      if (src?.muted) get().updateTrack(tapSourceId, { muted: false });
    }
    set({
      tapActive: false,
      tapHeld: false,
      tapFreeOriginMs: null,
      statusMessage: "タップ演奏をやめました",
    });
  },

  tapDown: () => {
    const s = get();
    if (!s.tapActive || s.tapHeld) return;
    if (s.tapIndex >= s.tapPitches.length) {
      set({ statusMessage: "譜面の最後まで叩き終わりました" });
      return;
    }
    const engine = getAudioEngine();
    let t = engine.getCurrentTime();
    if (s.status !== "playing") {
      const origin = s.tapFreeOriginMs ?? performance.now();
      if (s.tapFreeOriginMs == null) {
        set({ tapFreeOriginMs: origin });
        t = 0;
      } else {
        t = (performance.now() - origin) / 1000;
      }
    }
    const midi = s.tapPitches[s.tapIndex]!;
    const prev = s.tapRecorded;
    const closed =
      prev.length > 0
        ? prev.map((n, i) =>
            i === prev.length - 1
              ? { ...n, duration: Math.max(0.05, t - n.start) }
              : n,
          )
        : prev;
    const next: MidiNote = {
      midi,
      start: t,
      duration: 0.2,
      velocity: 0.78,
      channel: 0,
    };
    try {
      engine.tapNoteOn(midi, 0.78);
    } catch {
      /* noop */
    }
    set({
      tapHeld: true,
      tapIndex: s.tapIndex + 1,
      tapRecorded: [...closed, next],
      statusMessage: `タップ ${s.tapIndex + 1} / ${s.tapPitches.length}`,
    });
  },

  tapUp: () => {
    const s = get();
    if (!s.tapActive || !s.tapHeld) return;
    const engine = getAudioEngine();
    let t = engine.getCurrentTime();
    if (s.status !== "playing") {
      const origin = s.tapFreeOriginMs ?? performance.now();
      t = (performance.now() - origin) / 1000;
    }
    try {
      engine.tapNoteOff();
    } catch {
      /* noop */
    }
    const rec = s.tapRecorded.slice();
    const last = rec[rec.length - 1];
    if (last) {
      rec[rec.length - 1] = {
        ...last,
        duration: Math.max(0.06, t - last.start),
      };
    }
    set({ tapHeld: false, tapRecorded: rec });
  },

  setMidiInstrument: (id) => {
    set({ midiInstrument: id });
    try {
      getAudioEngine().setTapInstrument(id);
    } catch {
      /* noop */
    }
  },

  setTrackMidiInstrument: async (trackId, id) => {
    const track = get().tracks.find((t) => t.id === trackId);
    if (track?.pitchEdit) {
      set({
        statusMessage:
          "このバーは歌声です。音色の差し替えではなく、上下ドラッグで音程を変えます",
      });
      return;
    }
    if (!track?.midiNotes?.length) {
      get().updateTrack(trackId, { midiInstrument: id });
      get().setMidiInstrument(id);
      return;
    }
    if (get().status === "playing") get().pause();
    set({ isConvertingMidi: true, statusMessage: "音色を差し替えています…" });
    try {
      const notes = track.midiNotes;
      const parsed = notesToParsed(notes, track.name);
      const engine = getAudioEngine();
      const buffer = await renderMidiToAudioBuffer(
        parsed,
        engine.getSampleRate(),
        id,
      );
      get().updateTrack(trackId, { midiInstrument: id, buffer });
      get().setMidiInstrument(id);
      engine.updateDuration(get().tracks);
      set({
        duration: engine.getDuration(),
        statusMessage: `音色を「${instrumentLabel(id)}」にしました`,
      });
    } catch (e) {
      console.error(e);
      set({
        statusMessage: e instanceof Error ? e.message : "音色の変更に失敗しました",
      });
    } finally {
      set({ isConvertingMidi: false });
    }
  },

  rebakeMidiTracks: async () => {
    const midiTracks = get().tracks.filter(
      (t) => t.kind === "midi" && (t.midiNotes?.length ?? 0) > 0 && !t.pitchEdit,
    );
    if (!midiTracks.length) return;
    if (get().status === "playing") get().pause();
    set({ isConvertingMidi: true, statusMessage: "MIDI を焼き直しています…" });
    try {
      for (const t of midiTracks) {
        scheduleMidiBuffer(get, set, t.id);
      }
      set({ statusMessage: "MIDI の音色を更新しました" });
    } catch (e) {
      set({
        statusMessage: e instanceof Error ? e.message : "焼き直しに失敗しました",
      });
    } finally {
      set({ isConvertingMidi: false });
    }
  },

  openMidiEditor: (trackId) => {
    if (!trackId) {
      set({ midiEditTrackId: null });
      return;
    }
    const track = get().tracks.find((t) => t.id === trackId);
    const notes = ensureNoteIds(track?.midiNotes ?? []);
    if (track && notes.some((n, i) => n.id !== track.midiNotes?.[i]?.id)) {
      get().updateTrack(trackId, { midiNotes: notes });
    }
    set({
      midiEditTrackId: trackId,
      activeTrackId: trackId,
      midiViewLow: centerViewLow(notes),
      midiWindowBeat: 0,
      midiCursorBeat: 0,
      midiCursorPitch: notes[0]?.midi ?? 60,
      statusMessage: track?.pitchEdit
        ? `${track.name} の音階バー`
        : `${track?.name ?? "MIDI"} のピアノロール`,
    });
  },

  createMidiTrack: () => {
    const id = get().addTrack({ name: "MIDI", kind: "midi" });
    get().updateTrack(id, {
      midiNotes: [],
      midiSourceNotes: [],
      midiInstrument: get().midiInstrument,
    });
    get().openMidiEditor(id);
    set({ statusMessage: "空の MIDI トラックを作りました。クリックで音符を置けます" });
    return id;
  },

  setMidiWindowBeat: (beat) => {
    set({ midiWindowBeat: snapWindowBeat(Math.max(0, beat)) });
  },

  setMidiDrawBeats: (beats) => {
    const allowed = DRAW_LENGTHS.some((d) => d.beats === beats);
    set({ midiDrawBeats: allowed ? beats : 1 });
  },

  shiftMidiViewOctave: (delta) => {
    const next = get().midiViewLow + delta * 12;
    set({ midiViewLow: Math.max(24, Math.min(96, next)) });
  },

  setMidiCursor: (beat, pitch) => {
    set({
      midiCursorBeat: snapBeat(Math.max(0, beat)),
      midiCursorPitch: Math.max(24, Math.min(108, Math.round(pitch))),
    });
  },

  toggleMidiCell: (trackId, beat, pitch, mode) => {
    const track = get().tracks.find((t) => t.id === trackId);
    if (!track) return;
    const prev = ensureNoteIds(track.midiNotes ?? []);
    const result = toggleNoteAt({
      notes: prev,
      beat,
      pitch,
      bpm: get().bpm,
      drawBeats: get().midiDrawBeats,
    });
    if (mode === "delete" && result.action !== "delete") return;
    if (mode === "add" && result.action !== "add") return;
    if (track.pitchEdit && result.action === "add") {
      set({
        statusMessage:
          "歌声のバーは空クリックでは増えません。切り出した音をドラッグして直してください",
      });
      return;
    }
    if (result.action === "full") {
      set({
        statusMessage: `このトラックにはこれ以上音符を追加できません（${MAX_MIDI_NOTES}）`,
      });
      return;
    }
    const undo = [
      ...get().midiUndo,
      { trackId, notes: prev },
    ].slice(-30);
    get().updateTrack(trackId, { midiNotes: result.notes });
    set({
      midiUndo: undo,
      midiCursorBeat: snapBeat(beat),
      midiCursorPitch: Math.round(pitch),
      midiEditTrackId: trackId,
      activeTrackId: trackId,
      statusMessage:
        result.action === "add" ? "音符を置きました" : "音符を消しました",
    });
    scheduleMidiBuffer(get, set, trackId);
  },

  patchMidiNote: (trackId, noteId, patch, bake = true) => {
    const track = get().tracks.find((t) => t.id === trackId);
    if (!track) return;
    const prev = ensureNoteIds(track.midiNotes ?? []);
    const hit = prev.find((n) => n.id === noteId);
    if (!hit) return;
    const midi = patch.midi != null
      ? Math.max(24, Math.min(108, Math.round(patch.midi)))
      : hit.midi;
    const start = patch.start != null ? Math.max(0, patch.start) : hit.start;
    const duration =
      patch.duration != null
        ? Math.max(0.04, patch.duration)
        : hit.duration;
    const notes = patchNoteById(prev, noteId, { midi, start, duration });
    get().updateTrack(trackId, { midiNotes: notes });
    set({
      midiEditTrackId: trackId,
      activeTrackId: trackId,
      midiCursorPitch: midi,
      midiCursorBeat: snapBeat(secToBeat(start, get().bpm)),
    });
    const pitchChanged = midi !== hit.midi;
    const lenChanged = Math.abs(duration - hit.duration) > 0.001;
    if (pitchChanged || lenChanged) {
      scheduleNotePreview(get, trackId, noteId);
    }
    if (bake) scheduleMidiBuffer(get, set, trackId);
  },

  captureMidiUndo: (trackId) => {
    const track = get().tracks.find((t) => t.id === trackId);
    if (!track) return;
    const prev = ensureNoteIds(track.midiNotes ?? []);
    set({
      midiUndo: [...get().midiUndo, { trackId, notes: prev }].slice(-30),
    });
  },

  undoMidiEdit: () => {
    const stack = get().midiUndo;
    const last = stack[stack.length - 1];
    if (!last) {
      set({ statusMessage: "戻す編集がありません" });
      return;
    }
    if (typeof window !== "undefined") window.clearTimeout(notePreviewTimer);
    try {
      getAudioEngine().stopPreview();
    } catch {
      /* noop */
    }
    get().updateTrack(last.trackId, { midiNotes: last.notes });
    set({
      midiUndo: stack.slice(0, -1),
      midiEditTrackId: last.trackId,
      statusMessage: "ひとつ前の編集に戻しました",
    });
    scheduleMidiBuffer(get, set, last.trackId);
  },

  seekToBeat: (beat) => {
    get().seek(beatToSec(beat, get().bpm));
    set({ midiWindowBeat: snapWindowBeat(beat) });
  },

  finishTapRhythm: async () => {
    const s = get();
    if (!s.tapActive) return;
    if (s.tapHeld) get().tapUp();
    const notes = get().tapRecorded.filter((n) => n.duration > 0.04);
    const sourceId = s.tapSourceId;
    if (sourceId) {
      const src = get().tracks.find((t) => t.id === sourceId);
      if (src?.muted) get().updateTrack(sourceId, { muted: false });
    }
    try {
      getAudioEngine().tapNoteOff();
    } catch {
      /* noop */
    }
    set({
      tapActive: false,
      tapHeld: false,
      tapFreeOriginMs: null,
    });
    if (!notes.length) {
      set({ statusMessage: "タップが記録されていません" });
      return;
    }
    set({
      isConvertingMidi: true,
      statusMessage: "タップしたリズムを書き出しています…",
    });
    try {
      const name = "タップ · リズム";
      const parsed = notesToParsed(notes, name);
      const engine = getAudioEngine();
      const inst = get().midiInstrument;
      const buffer = await renderMidiToAudioBuffer(
        parsed,
        engine.getSampleRate(),
        inst,
      );
      const id = get().addTrack({ name, kind: "midi" });
      get().updateTrack(id, {
        buffer,
        midiNotes: notes,
        midiSourceNotes: notes,
        midiInstrument: inst,
      });
      engine.updateDuration(get().tracks);
      const midBytes = new Uint8Array(
        encodeMidiFile(notes, { bpm: get().bpm, name, instrument: inst }),
      );
      downloadBlob(
        new Blob([midBytes], { type: "audio/midi" }),
        "fuwari-tap.mid",
      );
      set({
        duration: engine.getDuration(),
        activeTrackId: id,
        statusMessage: `タップしたタイミングで記録しました（${melodySummary(notes)}）`,
      });
    } catch (e) {
      console.error(e);
      set({
        statusMessage:
          e instanceof Error ? e.message : "書き出しに失敗しました",
      });
    } finally {
      set({ isConvertingMidi: false });
    }
  },

  seek: (time) => {
    const { status } = get();
    const ids = syncedClipIds(get());
    const engine = getAudioEngine();
    const wasPlaying = status === "playing";
    if (wasPlaying) {
      engine.pause();
      if (ids.length) youtubePause(ids);
      stopYtClock();
    }
    engine.setCurrentTime(time);
    set({ currentTime: time });
    if (ids.length && ids.some((id) => isYouTubePlayerReady(id))) {
      youtubeSeek(time, ids);
    }
    if (wasPlaying) {
      get().play();
    }
  },

  play: () => {
    const { tracks, master, youtubeVideoId, youtubeSync, youtubeReady } =
      get();
    const engine = getAudioEngine();
    engine.applyMasterFx(master);
    engine.updateDuration(tracks);

    const audio = hasAudioBuffers(tracks);
    const yt =
      youtubeSync &&
      !!youtubeVideoId &&
      (youtubeReady || isYouTubePlayerReady());

    if (!audio && !yt) {
      set({
        statusMessage: youtubeVideoId
          ? "YouTube プレイヤー準備中…もう一度再生を押してください"
          : "再生する音源がありません",
      });
      return;
    }

    if (audio) {
      engine.play(tracks);
    }

    if (yt) {
      syncYoutubePlay(get);
      startYtClock(get, set);
    }

    set({
      status: "playing",
      statusMessage: !get().outputEnabled
        ? "再生中（出力オフ）"
        : yt && audio
          ? "再生中（トラック + YouTube）"
          : yt
            ? "YouTube 再生中"
            : "再生中",
      duration: Math.max(
        engine.getDuration(),
        yt ? youtubeGetDuration(syncedClipIds(get())) : 0,
        get().duration,
      ),
    });
  },

  pause: () => {
    const engine = getAudioEngine();
    engine.pause();
    syncYoutubePause(get);
    stopYtClock();

    let t = engine.getCurrentTime();
    if (!hasAudioBuffers(get().tracks) && isYouTubePlayerReady()) {
      t = youtubeGetCurrentTime();
    }

    set({
      status: "idle",
      currentTime: t,
      statusMessage: get().liveFxActive
        ? "エフェクター稼働中"
        : get().rangeMeasuring
          ? "声域測定中"
          : "一時停止",
    });
  },

  stop: () => {
    if (get().status === "recording") {
      void get().stopRecord();
      return;
    }
    const engine = getAudioEngine();
    engine.stop();
    syncYoutubeStop(get);
    stopYtClock();
    set({
      status: "idle",
      currentTime: 0,
      statusMessage: get().liveFxActive
        ? "エフェクター稼働中"
        : get().rangeMeasuring
          ? "声域測定中"
          : "停止",
    });
  },

  togglePlay: () => {
    if (get().status === "playing") get().pause();
    else get().play();
  },

  startRecord: async () => {
    if (!get().inputEnabled) {
      set({
        statusMessage:
          "入力がオフです。入力をオンにしてから録音してください",
      });
      return;
    }
    try {
      const engine = getAudioEngine();
      engine.setInputDeviceId(get().inputDeviceId);
      await engine.startRecording(get().tracks, { monitor: true });
      if (get().youtubeSync && get().youtubeVideoId) {
        syncYoutubePlay(get);
        startYtClock(get, set);
      }
      startLiveMeterPoll(get, set);
      set({
        status: "recording",
        statusMessage: get().outputEnabled
          ? "録音中 — もう一度 ● で停止。時間が進んでいます"
          : "録音中（出力オフ）— もう一度 ● で停止",
      });
      void get().refreshAudioDevices({ requestPermission: false });
    } catch (e) {
      console.error(e);
      const msg =
        e instanceof Error && e.message === "INPUT_DISABLED"
          ? "入力がオフです。入力をオンにしてから録音してください"
          : "マイクへのアクセスが拒否されました";
      set({
        statusMessage: msg,
        status: "idle",
      });
    }
  },

  stopRecord: async () => {
    try {
      const engine = getAudioEngine();
      const punchIn = engine.getRecPunchIn();
      const buffer = await engine.stopRecording();
      syncYoutubePause(get);
      stopYtClock();
      stopLiveMeter();
      if (!buffer) {
        set({
          status: "idle",
          statusMessage: get().liveFxActive
            ? "エフェクター稼働中"
            : "録音をキャンセル",
        });
        return;
      }
      let id = get().activeTrackId;
      const active = get().tracks.find((t) => t.id === id);
      if (!active || active.buffer || active.kind === "accompaniment" || active.kind === "midi") {
        const emptyVocal = get().tracks.find(
          (t) => t.kind === "vocal" && !t.buffer,
        );
        id =
          emptyVocal?.id ??
          get().addTrack({
            name: `録音 ${new Date().toLocaleTimeString("ja-JP", {
              hour: "2-digit",
              minute: "2-digit",
            })}`,
            kind: "vocal",
          });
      }
      get().updateTrack(id!, { buffer, undoBuffer: null, offset: punchIn });
      engine.updateDuration(get().tracks);
      set({
        status: "idle",
        duration: engine.getDuration(),
        statusMessage: get().liveFxActive
          ? "録音完了（エフェクター継続中）"
          : "録音完了",
        activeTrackId: id,
      });
    } catch (e) {
      console.error(e);
      set({ status: "idle", statusMessage: "録音処理に失敗しました" });
    }
  },

  toggleRecord: async () => {
    if (get().status === "recording") await get().stopRecord();
    else await get().startRecord();
  },

  setMaster: (patch) => {
    set((s) => {
      const master = normalizeMasterFx({ ...s.master, ...patch });
      try {
        getAudioEngine().applyMasterFx(master);
      } catch {
        /* not ready */
      }
      return { master };
    });
  },

  applyPreset: (id) => {
    const preset = MIX_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    get().setMaster({
      preset: id,
      reverbMix: preset.reverb,
      formantDb: preset.formant,
      pitchSemitones: preset.pitch,
      compressor: preset.compressor,
      noise: preset.noise,
    });
    set({
      statusMessage: get().liveFxActive
        ? `ライブ適用: ${preset.label}`
        : `プリセット「${preset.label}」を適用`,
    });
  },

  exportWav: async () => {
    const { tracks, master, isExporting } = get();
    if (isExporting) return;
    if (!tracks.some((t) => t.buffer)) {
      set({ statusMessage: "書き出す音源がありません" });
      return;
    }
    set({ isExporting: true, statusMessage: "書き出し中…" });
    try {
      if (get().status === "playing") get().pause();
      const blob = await getAudioEngine().exportMix(
        tracks,
        master,
        {
          profile: get().roomProfile,
          amount: get().roomAmount,
        },
        assembleLiveFx(
          get().liveChain,
          get().spectrumFilters,
          get().obsInserts,
          get().aiVoice,
          get().cableInserts,
          get().deviceInserts,
        ),
        get().extraPipelines,
      );
      downloadBlob(blob, `fuwari-rec-${Date.now()}.wav`);
      set({ statusMessage: "WAV 書き出し完了" });
    } catch (e) {
      console.error(e);
      set({
        statusMessage:
          e instanceof Error ? e.message : "書き出しに失敗しました",
      });
    } finally {
      set({ isExporting: false });
    }
  },

  setLoopPoint: (which) => {
    const t = get().currentTime;
    if (which === "clear") {
      set({ loopA: null, loopB: null, loopEnabled: false });
      return;
    }
    if (which === "a") set({ loopA: t });
    if (which === "b") set({ loopB: t, loopEnabled: true });
  },

  setYoutubeInput: (v) => set({ youtubeInput: v }),

  loadYoutube: (videoId, source) => {
    const s = get();
    if (s.youtubeClips.length >= MAX_YOUTUBE_CLIPS) {
      set({
        statusMessage: `YouTube は ${MAX_YOUTUBE_CLIPS} 本までです。どれかを閉じてから追加してください`,
      });
      return;
    }
    const clip = newYoutubeClip(
      videoId,
      (source ?? s.youtubeInput).trim() || videoId,
      s.youtubeClips.length,
    );
    clip.sync = s.youtubeSync;
    const clips = [...s.youtubeClips, clip];
    set({
      ...clipDerived(clips),
      youtubeInput: "",
      statusMessage:
        clips.length > 1
          ? `YouTube を追加（${clips.length}/${MAX_YOUTUBE_CLIPS}）`
          : "YouTube を読み込み中…",
    });
  },

  clearYoutube: () => {
    if (get().status === "playing" || get().status === "recording") {
      youtubePause();
    }
    stopYtClock();
    set({
      ...clipDerived([]),
      youtubeMuteForCancel: false,
      statusMessage: "YouTube をすべて閉じました",
    });
  },

  removeYoutubeClip: (id) => {
    const clips = get().youtubeClips.filter((c) => c.id !== id);
    if (clips.length === 0) {
      get().clearYoutube();
      return;
    }
    set({
      ...clipDerived(clips),
      statusMessage: `YouTube を閉じました（${clips.length}/${MAX_YOUTUBE_CLIPS}）`,
    });
  },

  setYoutubeReady: (ready, clipId) => {
    const current = get().youtubeClips;
    const clips = current.map((c, i) =>
      (clipId ? c.id === clipId : i === 0) ? { ...c, ready } : c,
    );
    set({
      ...clipDerived(clips),
      statusMessage: ready
        ? clips.length > 1
          ? `YouTube 準備完了（${clips.filter((c) => c.ready).length}/${clips.length}）`
          : "YouTube 準備完了 — 再生ボタンで同期再生できます"
        : get().statusMessage,
    });
    if (ready) {
      const st = get();
      const ids = syncedClipIds(st);
      const d = youtubeGetDuration(ids);
      if (d > 0) set({ duration: Math.max(st.duration, d) });
      applyYoutubeMutes(st);
      if (
        clipId &&
        (st.status === "playing" || st.status === "recording") &&
        ids.includes(clipId)
      ) {
        youtubePlay([clipId]);
        if (st.currentTime > 0.2) {
          youtubeSeek(st.currentTime, [clipId]);
          window.setTimeout(() => youtubePlay([clipId]), 120);
        }
      }
    }
  },

  setYoutubeSync: (sync) => {
    const clips = get().youtubeClips.map((c) => ({ ...c, sync }));
    set({ youtubeSync: sync, ...clipDerived(clips) });
    if (!sync) {
      youtubePause(get().youtubeClips.map((c) => c.id));
      set({ statusMessage: "YouTube 同期オフ（各プレイヤー単体操作）" });
    } else {
      set({ statusMessage: "YouTube 同期オン（再生ボタン連動）" });
    }
  },

  setYoutubeClipSync: (id, sync) => {
    const clips = get().youtubeClips.map((c) =>
      c.id === id ? { ...c, sync } : c,
    );
    set(clipDerived(clips));
    const st = get();
    if (!sync) {
      youtubePause([id]);
      return;
    }
    if (
      st.youtubeSync &&
      (st.status === "playing" || st.status === "recording")
    ) {
      applyYoutubeMutes(st);
      youtubePlay([id]);
      if (st.currentTime > 0.2) youtubeSeek(st.currentTime, [id]);
    }
  },

  setYoutubeClipMuted: (id, muted) => {
    const clips = get().youtubeClips.map((c) =>
      c.id === id ? { ...c, muted } : c,
    );
    set(clipDerived(clips));
    applyYoutubeMutes(get());
  },

  setYoutubePinned: (on, clipId) => {
    const clips = get().youtubeClips.map((c) =>
      !clipId || c.id === clipId ? { ...c, pinned: on } : c,
    );
    set({
      ...clipDerived(clips),
      statusMessage: on
        ? "YouTube をピン留め — ドラッグで移動、右下またはピンチで拡大縮小"
        : "YouTube のピン留めを外しました",
    });
  },

  toggleYoutubePinned: (clipId) => {
    if (clipId) {
      const c = get().youtubeClips.find((x) => x.id === clipId);
      if (!c) return;
      get().setYoutubePinned(!c.pinned, clipId);
      return;
    }
    const anyOff = get().youtubeClips.some((c) => !c.pinned);
    get().setYoutubePinned(anyOff);
  },

  setYoutubeFloatPos: (x, y, clipId) => {
    const target = clipId ?? get().youtubeClips[0]?.id;
    if (!target) return;
    const clips = get().youtubeClips.map((c) =>
      c.id === target ? { ...c, floatX: x, floatY: y } : c,
    );
    set(clipDerived(clips));
  },

  setYoutubeFloatSize: (w, clipId) => {
    const target = clipId ?? get().youtubeClips[0]?.id;
    if (!target) return;
    const clips = get().youtubeClips.map((c) =>
      c.id === target ? { ...c, floatW: w } : c,
    );
    set(clipDerived(clips));
  },

  applySeparation: async (mode) => {
    const { activeTrackId, tracks, isSeparating, status } = get();
    if (isSeparating) return;
    const track = tracks.find((t) => t.id === activeTrackId);
    if (!track?.buffer) {
      set({ statusMessage: "対象トラックに音源がありません" });
      return;
    }

    set({ isSeparating: true, statusMessage: "分離処理中…" });
    try {
      if (status === "playing") get().pause();
      const engine = getAudioEngine();
      const ctx = engine.getContext();
      await new Promise((r) => setTimeout(r, 30));
      const undo = cloneAudioBuffer(track.buffer, ctx);
      const processed = processSeparation(track.buffer, mode, ctx);
      get().updateTrack(track.id, {
        buffer: processed,
        undoBuffer: undo,
        kind: mode === "remove-vocals" ? "accompaniment" : track.kind,
      });
      engine.updateDuration(get().tracks);
      set({
        duration: engine.getDuration(),
        statusMessage:
          mode === "remove-vocals"
            ? "ボーカルキャンセルを適用しました"
            : "音源キャンセルを適用しました",
      });
    } catch (e) {
      console.error(e);
      set({
        statusMessage:
          e instanceof Error ? e.message : "分離処理に失敗しました",
      });
    } finally {
      set({ isSeparating: false });
    }
  },

  loadFileForYoutubeCancel: async (file, mode) => {
    if (get().isLoadingMedia || get().isSeparating) return;
    try {
      await get().loadFileToTrack(null, file);
      const id = get().activeTrackId;
      if (!id) return;
      const label =
        mode === "remove-vocals" ? "YouTube用カラオケ" : "YouTube用ボーカル";
      get().updateTrack(id, { name: label, kind: "accompaniment" });
      set({ activeTrackId: id });
      await get().applySeparation(mode);
      set({
        youtubeMuteForCancel: true,
        youtubeSync: true,
        youtubeClips: get().youtubeClips.map((c) => ({ ...c, sync: true })),
        statusMessage:
          mode === "remove-vocals"
            ? "映像は YouTube、音はボーカルキャンセルしたファイルです"
            : "映像は YouTube、音は音源キャンセルしたファイルです",
      });
      applyYoutubeMutes(get());
    } catch (e) {
      console.error(e);
      set({
        statusMessage:
          e instanceof Error ? e.message : "YouTube 用の読み込みに失敗しました",
      });
    }
  },

  restoreTrackBuffer: (id) => {
    const trackId = id ?? get().activeTrackId;
    const track = get().tracks.find((t) => t.id === trackId);
    if (!track?.undoBuffer) {
      set({ statusMessage: "戻せる音源がありません" });
      return;
    }
    if (get().status === "playing") get().pause();
    get().updateTrack(track.id, {
      buffer: track.undoBuffer,
      undoBuffer: null,
    });
    try {
      const engine = getAudioEngine();
      engine.updateDuration(get().tracks);
      set({
        duration: engine.getDuration(),
        statusMessage: "直前の音源に戻しました",
      });
    } catch {
      set({ statusMessage: "直前の音源に戻しました" });
    }
  },

  refreshAudioDevices: async (opts) => {
    if (typeof window === "undefined") return;
    set({ devicesLoading: true });
    try {
      if (opts?.requestPermission) {
        const ok = await ensureMicPermission();
        set({ devicesPermission: ok ? "granted" : "denied" });
        if (!ok) {
          set({
            statusMessage: "マイク許可が必要です（設定から許可してください）",
          });
        }
      }

      const { inputs, outputs } = await listAudioDevices();
      const hasLabels = inputs.some((d) => !d.label.startsWith("マイク "));
      if (hasLabels) {
        set({ devicesPermission: "granted" });
      }

      const inId = get().inputDeviceId;
      const outId = get().outputDeviceId;
      const nextIn =
        inId && inputs.some((d) => d.deviceId === inId) ? inId : "";
      const nextOut =
        outId && outputs.some((d) => d.deviceId === outId) ? outId : "";

      set({
        inputDevices: inputs,
        outputDevices: outputs,
        inputDeviceId: nextIn,
        outputDeviceId: nextOut,
        outputSelectSupported:
          supportsOutputSinkSelection() ||
          getAudioEngine().supportsOutputSelection(),
        statusMessage:
          opts?.requestPermission && get().devicesPermission === "granted"
            ? `デバイス更新: 入力 ${inputs.length} / 出力 ${outputs.length}`
            : get().statusMessage,
      });

      getAudioEngine().setInputDeviceId(nextIn);
      if (nextOut !== getAudioEngine().getOutputDeviceId()) {
        try {
          await getAudioEngine().setOutputDeviceId(nextOut);
        } catch {
          /* ignore on refresh */
        }
      }
    } catch (e) {
      console.error(e);
      set({ statusMessage: "デバイス一覧の取得に失敗しました" });
    } finally {
      set({ devicesLoading: false });
    }
  },

  setInputDevice: (deviceId) => {
    if (get().status === "recording") {
      set({ statusMessage: "録音中は入力デバイスを変更できません" });
      return;
    }
    set({ inputDeviceId: deviceId });
    try {
      getAudioEngine().setInputDeviceId(deviceId);
      const label =
        get().inputDevices.find((d) => d.deviceId === deviceId)?.label ||
        "システムデフォルト";
      set({ statusMessage: `入力: ${label}` });
      if (get().liveFxActive) {
        void getAudioEngine().restartLiveFxIfActive();
      } else if (get().rangeMeasuring) {
        void (async () => {
          getAudioEngine().stopPitchTap();
          await getAudioEngine().startPitchTap();
        })();
      }
    } catch (e) {
      console.error(e);
    }
  },

  setOutputDevice: async (deviceId) => {
    if (get().status === "recording") {
      set({ statusMessage: "録音中は出力デバイスを変更できません" });
      return;
    }
    const prev = get().outputDeviceId;
    set({ outputDeviceId: deviceId });
    try {
      getAudioEngine().getContext();
      await getAudioEngine().setOutputDeviceId(deviceId);
      const label =
        get().outputDevices.find((d) => d.deviceId === deviceId)?.label ||
        "システムデフォルト";
      set({ statusMessage: `出力: ${label}` });
    } catch (e) {
      console.error(e);
      set({
        outputDeviceId: prev,
        statusMessage:
          e instanceof Error ? e.message : "出力デバイスの切り替えに失敗",
      });
    }
  },

  setInputEnabled: (enabled) => {
    set({ inputEnabled: enabled });
    try {
      getAudioEngine().setInputEnabled(enabled);
    } catch {
      /* not ready */
    }
    set({
      statusMessage: enabled
        ? "入力オン"
        : "入力オフ（マイク録音・モニター停止）",
    });
  },

  setOutputEnabled: (enabled) => {
    set({ outputEnabled: enabled });
    try {
      getAudioEngine().setOutputEnabled(enabled);
    } catch {
      /* not ready */
    }
    applyYoutubeMutes(get());
    set({
      statusMessage: enabled
        ? "出力オン"
        : "出力オフ（トラック再生をミュート）",
    });
  },

  toggleInputEnabled: () => {
    get().setInputEnabled(!get().inputEnabled);
  },

  toggleOutputEnabled: () => {
    get().setOutputEnabled(!get().outputEnabled);
  },

  startLiveFx: async () => {
    if (get().liveFxActive || get().liveFxBusy) return;
    if (!get().inputEnabled) {
      set({
        statusMessage:
          "入力がオフです。入力をオンにしてからエフェクターを起動してください",
      });
      return;
    }
    set({ liveFxBusy: true });
    try {
      const engine = getAudioEngine();
      engine.setInputDeviceId(get().inputDeviceId);
      engine.applyMasterFx(get().master);
      engine.setRoomProfile(get().roomProfile);
      engine.setRoomAmount(get().roomAmount);
      engine.setVoiceProfile(get().voiceProfile);
      engine.setVoiceAmount(get().voiceAmount);
      await engine.startLiveFx();
      set({
        liveFxActive: true,
        statusMessage: "エフェクター ON — マイクの声にリアルタイムでかかります",
      });
      startLiveMeterPoll(get, set);
      void get().refreshAudioDevices({ requestPermission: false });
    } catch (e) {
      console.error(e);
      set({
        liveFxActive: false,
        statusMessage:
          e instanceof Error && e.message === "INPUT_DISABLED"
            ? "入力がオフです"
            : "マイクへのアクセスが拒否されました",
      });
    } finally {
      set({ liveFxBusy: false });
    }
  },

  stopLiveFx: () => {
    try {
      getAudioEngine().stopLiveFx();
    } catch {
      /* noop */
    }
    stopLiveMeter();
    set({
      liveFxActive: false,
      liveLevel: 0,
      statusMessage: get().rangeMeasuring ? "声域測定中" : "エフェクター OFF",
    });
  },

  toggleLiveFx: async () => {
    if (get().liveFxActive) get().stopLiveFx();
    else await get().startLiveFx();
  },

  setRoomAmount: (n) => {
    const roomAmount = Math.max(0, Math.min(1, n));
    set({ roomAmount });
    try {
      getAudioEngine().setRoomAmount(roomAmount);
    } catch {
      /* not ready */
    }
  },

  clearRoomProfile: () => {
    set({ roomProfile: null, roomAmount: 0, roomCaptureProgress: 0 });
    try {
      getAudioEngine().setRoomProfile(null);
      getAudioEngine().setRoomAmount(0);
    } catch {
      /* not ready */
    }
    set({ statusMessage: "部屋の記憶を消しました" });
  },

  setVoiceAmount: (n) => {
    const voiceAmount = Math.max(0, Math.min(1, n));
    set({ voiceAmount });
    try {
      getAudioEngine().setVoiceAmount(voiceAmount);
    } catch {
      /* not ready */
    }
  },

  clearVoiceProfile: () => {
    set({ voiceProfile: null, voiceAmount: 0, voiceCaptureProgress: 0 });
    try {
      getAudioEngine().setVoiceProfile(null);
      getAudioEngine().setVoiceAmount(0);
    } catch {
      /* not ready */
    }
    set({ statusMessage: "自分の声の記憶を消しました" });
  },

  captureVoiceProfile: async () => {
    if (get().voiceCapturing) return;
    if (!get().inputEnabled) {
      set({
        statusMessage: "入力がオフです。入力をオンにしてから声を覚えてください",
      });
      return;
    }
    set({
      voiceCapturing: true,
      voiceCaptureProgress: 0,
      statusMessage:
        "自分の声を記憶中 — テレビを消し、いつもどおり数秒歌ってください",
    });
    try {
      const engine = getAudioEngine();
      engine.setInputDeviceId(get().inputDeviceId);
      const profile = await engine.captureVoiceProfile(3.2, (p) => {
        set({ voiceCaptureProgress: p });
      });
      const nextAmount = get().voiceAmount > 0.05 ? get().voiceAmount : 0.62;
      engine.setVoiceAmount(nextAmount);
      set({
        voiceProfile: profile,
        voiceAmount: nextAmount,
        voiceCaptureProgress: 1,
        statusMessage:
          "声を覚えました。自分以外（テレビ・他人）をスライダーで引けます",
      });
    } catch (e) {
      console.error(e);
      set({
        statusMessage:
          e instanceof Error && e.message === "VOICE_TOO_QUIET"
            ? "声が小さすぎました。もう少し大きく歌って覚え直してください"
            : e instanceof Error && e.message === "INPUT_DISABLED"
              ? "入力がオフです"
              : "声を覚えられませんでした。マイクを許可してください",
      });
    } finally {
      set({ voiceCapturing: false });
    }
  },

  addSpectrumFilter: (kind, hz) => {
    const chain = readChain(get());
    if (chain.spectrumFilters.length >= MAX_SPECTRUM_FILTERS) {
      set({
        statusMessage: `フィルターは ${MAX_SPECTRUM_FILTERS} 段までです`,
      });
      return null;
    }
    const filter = newSpectrumFilter(kind, hz);
    const spectrumFilters = [...chain.spectrumFilters, filter];
    const check = loadAfterChainPatch(get(), { spectrumFilters });
    if (check.over) {
      set({ statusMessage: cpuRefuseMessage(check.load, check.budget) });
      return null;
    }
    const liveChain = [
      ...reconcileLiveChain(
        chain.liveChain,
        chain.spectrumFilters,
        chain.obsInserts,
        chain.aiVoice,
        chain.cableInserts,
        chain.deviceInserts,
      ),
      { family: "spectrum" as const, id: filter.id },
    ];
    commitChain(get, set, { spectrumFilters, liveChain }, {
      statusMessage: cpuStatus(`フィルター「${filter.name}」を追加`, check),
    });
    return filter.id;
  },

  updateSpectrumFilter: (id, patch) => {
    const chain = readChain(get());
    const spectrumFilters = chain.spectrumFilters.map((f) =>
      f.id === id ? { ...f, ...patch, id: f.id } : f,
    );
    commitChain(get, set, { spectrumFilters });
  },

  removeSpectrumFilter: (id) => {
    const chain = readChain(get());
    const target = chain.spectrumFilters.find((f) => f.id === id);
    const spectrumFilters = chain.spectrumFilters.filter((f) => f.id !== id);
    commitChain(get, set, { spectrumFilters }, {
      statusMessage: target
        ? `フィルター「${target.name}」を削除`
        : "フィルターを削除",
    });
  },

  toggleSpectrumFilter: (id) => {
    const chain = readChain(get());
    const cur = chain.spectrumFilters.find((f) => f.id === id);
    const spectrumFilters = chain.spectrumFilters.map((f) =>
      f.id === id ? { ...f, enabled: !f.enabled } : f,
    );
    if (cur && !cur.enabled) {
      const check = loadAfterChainPatch(get(), { spectrumFilters });
      if (check.over) {
        set({ statusMessage: cpuRefuseMessage(check.load, check.budget) });
        return;
      }
    }
    commitChain(get, set, { spectrumFilters });
  },

  moveSpectrumFilter: (id, delta) => {
    get().moveLiveSlot(id, delta);
  },

  replaceSpectrumFilters: (filters) => {
    commitChain(get, set, {
      spectrumFilters: filters.slice(0, MAX_SPECTRUM_FILTERS),
    });
  },

  addObsInsert: (kind) => {
    const chain = readChain(get());
    if (chain.obsInserts.length >= MAX_OBS_INSERTS) {
      set({
        statusMessage: `ライブフィルターは ${MAX_OBS_INSERTS} 段までです`,
      });
      return null;
    }
    const created = newObsInsert(kind);
    const obsInserts = labelObsInserts([...chain.obsInserts, created]);
    const check = loadAfterChainPatch(get(), { obsInserts });
    if (check.over) {
      set({ statusMessage: cpuRefuseMessage(check.load, check.budget) });
      return null;
    }
    const named = obsInserts.find((f) => f.id === created.id);
    const liveChain = [
      ...reconcileLiveChain(
        chain.liveChain,
        chain.spectrumFilters,
        chain.obsInserts,
        chain.aiVoice,
        chain.cableInserts,
        chain.deviceInserts,
      ),
      { family: "obs" as const, id: created.id },
    ];
    commitChain(get, set, { obsInserts, liveChain }, {
      statusMessage: cpuStatus(
        named
          ? `「${named.name}」をライブエフェクターに挿入`
          : "フィルターを挿入",
        check,
      ),
    });
    return created.id;
  },

  updateObsInsert: (id, patch) => {
    const chain = readChain(get());
    const obsInserts = labelObsInserts(
      chain.obsInserts.map((f) =>
        f.id === id ? { ...f, ...patch, id: f.id, kind: f.kind } : f,
      ),
    );
    commitChain(get, set, { obsInserts });
  },

  removeObsInsert: (id) => {
    const chain = readChain(get());
    const target = chain.obsInserts.find((f) => f.id === id);
    const obsInserts = labelObsInserts(
      chain.obsInserts.filter((f) => f.id !== id),
    );
    commitChain(get, set, { obsInserts }, {
      statusMessage: target
        ? `「${target.name}」をライブから外しました`
        : "フィルターを外しました",
    });
  },

  toggleObsInsert: (id) => {
    const chain = readChain(get());
    const cur = chain.obsInserts.find((f) => f.id === id);
    const obsInserts = chain.obsInserts.map((f) =>
      f.id === id ? { ...f, enabled: !f.enabled } : f,
    );
    if (cur && !cur.enabled) {
      const check = loadAfterChainPatch(get(), { obsInserts });
      if (check.over) {
        set({ statusMessage: cpuRefuseMessage(check.load, check.budget) });
        return;
      }
    }
    commitChain(get, set, { obsInserts });
  },

  moveObsInsert: (id, delta) => {
    get().moveLiveSlot(id, delta);
  },

  replaceObsInserts: (inserts) => {
    commitChain(get, set, {
      obsInserts: labelObsInserts(inserts.slice(0, MAX_OBS_INSERTS)),
    });
  },

  addAiVoice: () => {
    const existing = anyAiVoice(get());
    if (existing) {
      set({
        statusMessage: `AIボイスは ${MAX_AI_VOICE} 段までです。位置は↑↓で変えてください`,
      });
      return existing.id;
    }
    const chain = readChain(get());
    const created = newAiVoiceInsert();
    const check = loadAfterChainPatch(get(), { aiVoice: created });
    if (check.over) {
      set({ statusMessage: cpuRefuseMessage(check.load, check.budget) });
      return null;
    }
    const liveChain = [
      ...reconcileLiveChain(
        chain.liveChain,
        chain.spectrumFilters,
        chain.obsInserts,
        null,
        chain.cableInserts,
        chain.deviceInserts,
      ),
      { family: "ai" as const, id: created.id },
    ];
    commitChain(get, set, { aiVoice: created, liveChain }, {
      statusMessage: cpuStatus("AIボイスをライブエフェクターに挿入（一段）", check),
    });
    return created.id;
  },

  updateAiVoice: (patch) => {
    const chain = readChain(get());
    const cur = chain.aiVoice;
    if (!cur) return;
    const aiVoice = newAiVoiceInsert({ ...cur, ...patch, id: cur.id });
    commitChain(get, set, { aiVoice });
  },

  removeAiVoice: () => {
    const chain = readChain(get());
    const cur = chain.aiVoice;
    if (!cur) return;
    setAiModelFile(cur.id, null);
    commitChain(get, set, { aiVoice: null }, {
      statusMessage: "AIボイスをライブから外しました",
    });
  },

  toggleAiVoice: () => {
    const chain = readChain(get());
    const cur = chain.aiVoice;
    if (!cur) return;
    const aiVoice = { ...cur, enabled: !cur.enabled };
    if (!cur.enabled) {
      const check = loadAfterChainPatch(get(), { aiVoice });
      if (check.over) {
        set({ statusMessage: cpuRefuseMessage(check.load, check.budget) });
        return;
      }
    }
    commitChain(get, set, { aiVoice });
  },

  addCableInsert: (kind) => {
    const chain = readChain(get());
    if (chain.cableInserts.length >= MAX_CABLE_INSERTS) {
      set({
        statusMessage: `仮想ケーブルは ${MAX_CABLE_INSERTS} 段までです`,
      });
      return null;
    }
    const used = new Set(chain.cableInserts.map((c) => c.cable));
    const cable = CABLE_INDEXES.find((n) => !used.has(n)) ?? 1;
    const created = newCableInsert(kind, { cable });
    const cableInserts = [...chain.cableInserts, created];
    const liveChain = [
      ...reconcileLiveChain(
        chain.liveChain,
        chain.spectrumFilters,
        chain.obsInserts,
        chain.aiVoice,
        chain.cableInserts,
        chain.deviceInserts,
      ),
      { family: "cable" as const, id: created.id },
    ];
    commitChain(get, set, { cableInserts, liveChain }, {
      statusMessage: `「${created.name}」を挿入`,
    });
    return created.id;
  },

  updateCableInsert: (id, patch) => {
    const chain = readChain(get());
    const cableInserts = chain.cableInserts.map((c) => {
      if (c.id !== id) return c;
      const next = newCableInsert(patch.kind ?? c.kind, {
        ...c,
        ...patch,
        id: c.id,
      });
      if (!patch.name) next.name = defaultCableName(next);
      else next.name = patch.name;
      return next;
    });
    commitChain(get, set, { cableInserts });
  },

  removeCableInsert: (id) => {
    const chain = readChain(get());
    const target = chain.cableInserts.find((c) => c.id === id);
    const cableInserts = chain.cableInserts.filter((c) => c.id !== id);
    commitChain(get, set, { cableInserts }, {
      statusMessage: target
        ? `「${target.name}」を外しました`
        : "仮想ケーブルを外しました",
    });
  },

  toggleCableInsert: (id) => {
    const chain = readChain(get());
    const cableInserts = chain.cableInserts.map((c) =>
      c.id === id ? { ...c, enabled: !c.enabled } : c,
    );
    commitChain(get, set, { cableInserts });
  },

  addDeviceInsert: (kind) => {
    const chain = readChain(get());
    if (chain.deviceInserts.length >= MAX_DEVICE_IO) {
      set({
        statusMessage: `マイク／スピーカー段は ${MAX_DEVICE_IO} までです`,
      });
      return null;
    }
    const created = newDeviceIoInsert(kind);
    const deviceInserts = [...chain.deviceInserts, created];
    const liveChain = [
      ...reconcileLiveChain(
        chain.liveChain,
        chain.spectrumFilters,
        chain.obsInserts,
        chain.aiVoice,
        chain.cableInserts,
        chain.deviceInserts,
      ),
      { family: "device" as const, id: created.id },
    ];
    commitChain(get, set, { deviceInserts, liveChain }, {
      statusMessage: `「${created.name}」を挿入`,
    });
    return created.id;
  },

  updateDeviceInsert: (id, patch) => {
    const chain = readChain(get());
    const deviceInserts = chain.deviceInserts.map((d) => {
      if (d.id !== id) return d;
      const next = newDeviceIoInsert(patch.kind ?? d.kind, {
        ...d,
        ...patch,
        id: d.id,
      });
      if (!patch.name) next.name = defaultDeviceIoName(next);
      else next.name = patch.name;
      return next;
    });
    commitChain(get, set, { deviceInserts });
  },

  removeDeviceInsert: (id) => {
    const chain = readChain(get());
    const target = chain.deviceInserts.find((d) => d.id === id);
    const deviceInserts = chain.deviceInserts.filter((d) => d.id !== id);
    commitChain(get, set, { deviceInserts }, {
      statusMessage: target
        ? `「${target.name}」を外しました`
        : "入出力段を外しました",
    });
  },

  toggleDeviceInsert: (id) => {
    const chain = readChain(get());
    const deviceInserts = chain.deviceInserts.map((d) =>
      d.id === id ? { ...d, enabled: !d.enabled } : d,
    );
    commitChain(get, set, { deviceInserts });
  },

  addExtraPipeline: () => {
    const budget = extraPipelineBudget();
    if (get().extraPipelines.length >= budget) {
      set({
        statusMessage: `パイプラインはこの端末では ${budget + 1} 本までです（${cpuCores()}コア）`,
      });
      return null;
    }
    const number = (get().extraPipelines.at(-1)?.number ?? 1) + 1;
    const cable = asCableIndex(Math.min(number - 1, MAX_CABLES));
    const created = newExtraPipeline(number, cable);
    const extraPipelines = [...get().extraPipelines, created];
    const check = cpuOverBudget({
      spectrumFilters: get().spectrumFilters,
      obsInserts: get().obsInserts,
      aiVoice: get().aiVoice,
      extraPipelines,
    });
    if (check.over) {
      set({ statusMessage: cpuRefuseMessage(check.load, check.budget) });
      return null;
    }
    let cableInserts = get().cableInserts;
    let liveChain = get().liveChain;
    const hasOut = cableInserts.some(
      (c) => c.kind === "out" && c.cable === cable,
    );
    const hasIn = cableInserts.some(
      (c) => c.kind === "in" && c.cable === cable,
    );
    const add: typeof liveChain = [];
    if (!hasOut) {
      const out = newCableInsert("out", { cable, mode: "split" });
      cableInserts = [...cableInserts, out];
      add.push({ family: "cable", id: out.id });
    }
    if (!hasIn) {
      const inn = newCableInsert("in", { cable });
      cableInserts = [...cableInserts, inn];
      add.push({ family: "cable", id: inn.id });
    }
    if (add.length) {
      liveChain = [
        ...reconcileLiveChain(
          liveChain,
          get().spectrumFilters,
          get().obsInserts,
          get().aiVoice,
          cableInserts,
          get().deviceInserts,
        ),
        ...add,
      ];
    }
    const pipelineVia = get().pipelineVia;
    set({
      extraPipelines,
      cableInserts,
      pipelineVia,
      activePipelineId: created.id,
      liveChain: pushLiveFx({
        ...get(),
        extraPipelines,
        cableInserts,
        pipelineVia,
        liveChain,
      }),
      statusMessage: cpuStatus(
        `${created.name}を追加。編集タブを切り替えられます（音は同時に動きます）`,
        check,
      ),
    });
    return created.id;
  },

  updateExtraPipeline: (id, patch) => {
    const extraPipelines = get().extraPipelines.map((p) =>
      p.id === id ? { ...p, ...patch, id: p.id } : p,
    );
    if (patch.enabled === true) {
      const check = cpuOverBudget({
        spectrumFilters: get().spectrumFilters,
        obsInserts: get().obsInserts,
        aiVoice: get().aiVoice,
        extraPipelines,
      });
      if (check.over) {
        set({ statusMessage: cpuRefuseMessage(check.load, check.budget) });
        return;
      }
    }
    const liveChain = pushLiveFx({ ...get(), extraPipelines });
    set({ extraPipelines, liveChain });
  },

  removeExtraPipeline: (id) => {
    const extraPipelines = get().extraPipelines.filter((p) => p.id !== id);
    let pipelineVia = get().pipelineVia;
    const liveChain = pushLiveFx({ ...get(), extraPipelines, pipelineVia });
    set({
      extraPipelines,
      pipelineVia,
      liveChain,
      activePipelineId:
        get().activePipelineId === id ? "main" : get().activePipelineId,
      statusMessage: "パイプラインを外しました",
    });
  },

  setPipelineVia: (via) => {
    const liveChain = pushLiveFx({ ...get(), pipelineVia: via });
    set({ pipelineVia: via, liveChain });
  },

  setActivePipelineId: (id) => {
    set({ activePipelineId: id });
  },

  addPipelineSpectrum: (pipeId, kind, hz) => {
    let added: string | null = null;
    const extraPipelines = get().extraPipelines.map((p) => {
      if (p.id !== pipeId) return p;
      if (p.spectrumFilters.length >= MAX_SPECTRUM_FILTERS) return p;
      const filter = newSpectrumFilter(kind, hz);
      added = filter.id;
      const liveChain = [
        ...pipeSlots(p),
        { family: "spectrum" as const, id: filter.id },
      ];
      return {
        ...p,
        spectrumFilters: [...p.spectrumFilters, filter],
        liveChain,
      };
    });
    if (!added) {
      set({ statusMessage: "このパイプラインはフィルターがいっぱいです" });
      return null;
    }
    const check = cpuOverBudget({
      spectrumFilters: get().spectrumFilters,
      obsInserts: get().obsInserts,
      aiVoice: get().aiVoice,
      extraPipelines,
    });
    if (check.over) {
      set({ statusMessage: cpuRefuseMessage(check.load, check.budget) });
      return null;
    }
    const liveChain = pushLiveFx({ ...get(), extraPipelines });
    set({
      extraPipelines,
      liveChain,
      statusMessage: cpuStatus("パイプラインにフィルターを追加", check),
    });
    return added;
  },

  addPipelineObs: (pipeId, kind) => {
    let added: string | null = null;
    const extraPipelines = get().extraPipelines.map((p) => {
      if (p.id !== pipeId) return p;
      if (p.obsInserts.length >= MAX_OBS_INSERTS) return p;
      const created = newObsInsert(kind);
      added = created.id;
      const obsInserts = labelObsInserts([...p.obsInserts, created]);
      const liveChain = [
        ...pipeSlots(p),
        { family: "obs" as const, id: created.id },
      ];
      return { ...p, obsInserts, liveChain };
    });
    if (!added) {
      set({ statusMessage: "このパイプラインはフィルターがいっぱいです" });
      return null;
    }
    const check = cpuOverBudget({
      spectrumFilters: get().spectrumFilters,
      obsInserts: get().obsInserts,
      aiVoice: get().aiVoice,
      extraPipelines,
    });
    if (check.over) {
      set({ statusMessage: cpuRefuseMessage(check.load, check.budget) });
      return null;
    }
    const liveChain = pushLiveFx({ ...get(), extraPipelines });
    set({
      extraPipelines,
      liveChain,
      statusMessage: cpuStatus("パイプラインにフィルターを追加", check),
    });
    return added;
  },

  removePipelineItem: (pipeId, itemId) => {
    const extraPipelines = get().extraPipelines.map((p) => {
      if (p.id !== pipeId) return p;
      const spectrumFilters = p.spectrumFilters.filter((f) => f.id !== itemId);
      const obsInserts = p.obsInserts.filter((f) => f.id !== itemId);
      const cableInserts = (p.cableInserts ?? []).filter((c) => c.id !== itemId);
      const deviceInserts = (p.deviceInserts ?? []).filter((d) => d.id !== itemId);
      const aiVoice = p.aiVoice?.id === itemId ? null : p.aiVoice;
      const next = {
        ...p,
        spectrumFilters,
        obsInserts,
        cableInserts,
        deviceInserts,
        aiVoice,
      };
      return { ...next, liveChain: pipeSlots(next) };
    });
    const liveChain = pushLiveFx({ ...get(), extraPipelines });
    set({ extraPipelines, liveChain });
  },

  togglePipelineItem: (pipeId, itemId) => {
    const current = get().extraPipelines.find((p) => p.id === pipeId);
    const turningOn = Boolean(
      current?.spectrumFilters.find((f) => f.id === itemId && !f.enabled) ||
        current?.obsInserts.find((f) => f.id === itemId && !f.enabled),
    );
    const extraPipelines = get().extraPipelines.map((p) => {
      if (p.id !== pipeId) return p;
      return {
        ...p,
        spectrumFilters: p.spectrumFilters.map((f) =>
          f.id === itemId ? { ...f, enabled: !f.enabled } : f,
        ),
        obsInserts: p.obsInserts.map((f) =>
          f.id === itemId ? { ...f, enabled: !f.enabled } : f,
        ),
      };
    });
    if (turningOn) {
      const check = cpuOverBudget({
        spectrumFilters: get().spectrumFilters,
        obsInserts: get().obsInserts,
        aiVoice: get().aiVoice,
        extraPipelines,
      });
      if (check.over) {
        set({ statusMessage: cpuRefuseMessage(check.load, check.budget) });
        return;
      }
    }
    const liveChain = pushLiveFx({ ...get(), extraPipelines });
    set({ extraPipelines, liveChain });
  },

  moveLiveSlot: (id, delta) => {
    const chain = readChain(get());
    const current = reconcileLiveChain(
      chain.liveChain,
      chain.spectrumFilters,
      chain.obsInserts,
      chain.aiVoice,
      chain.cableInserts,
      chain.deviceInserts,
    );
    const liveChain = shiftLiveSlot(current, id, delta);
    if (liveChain === current) return;
    const idx = liveChain.findIndex((s) => s.id === id);
    commitChain(get, set, { liveChain }, {
      statusMessage:
        idx >= 0
          ? `適用順 ${idx + 1}/${liveChain.length}（上が先）`
          : "適用順を変更",
    });
  },

  captureFxSnapshot: (name) => {
    const s = get();
    return normalizeSnapshot({
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `fx-${Date.now()}`,
      name: name.trim() || "無名",
      savedAt: new Date().toISOString(),
      master: { ...s.master },
      filters: s.spectrumFilters.map((f) => ({
        ...f,
        reverb: { ...f.reverb },
        delay: { ...f.delay },
      })),
      inserts: s.obsInserts.map((f) => ({ ...f })),
      aiVoice: s.aiVoice ? { ...s.aiVoice } : null,
      liveChain: s.liveChain.map((slot) => ({ ...slot })),
      cableInserts: s.cableInserts.map((c) => ({ ...c })),
      deviceInserts: s.deviceInserts.map((d) => ({ ...d })),
      extraPipelines: s.extraPipelines.map((p) => ({
        ...p,
        spectrumFilters: p.spectrumFilters.map((f) => ({
          ...f,
          reverb: { ...f.reverb },
          delay: { ...f.delay },
        })),
        obsInserts: p.obsInserts.map((f) => ({ ...f })),
        cableInserts: (p.cableInserts ?? []).map((c) => ({ ...c })),
        deviceInserts: (p.deviceInserts ?? []).map((d) => ({ ...d })),
        aiVoice: p.aiVoice ? { ...p.aiVoice } : null,
        liveChain: p.liveChain.map((slot) => ({ ...slot })),
      })),
      roomAmount: s.roomAmount,
      voiceAmount: s.voiceAmount,
      roomProfile: s.roomProfile
        ? { ...s.roomProfile, bins: s.roomProfile.bins.slice() }
        : null,
      voiceProfile: s.voiceProfile
        ? { ...s.voiceProfile, bins: s.voiceProfile.bins.slice() }
        : null,
    });
  },

  applyFxSnapshot: (snap) => {
    const n = normalizeSnapshot(snap);
    const extraPipelines = n.extraPipelines ?? [];
    const cableInserts = n.cableInserts ?? [];
    const deviceInserts = n.deviceInserts ?? [];
    const active = get().activePipelineId;
    const activePipelineId =
      active === "main" || extraPipelines.some((p) => p.id === active)
        ? active
        : "main";
    set({
      master: n.master,
      spectrumFilters: n.filters,
      obsInserts: n.inserts,
      aiVoice: n.aiVoice ?? null,
      liveChain: n.liveChain ?? [],
      cableInserts,
      deviceInserts,
      extraPipelines,
      activePipelineId,
      roomAmount: n.roomAmount,
      voiceAmount: n.voiceAmount,
      roomProfile: n.roomProfile
        ? { ...n.roomProfile, bins: n.roomProfile.bins.slice() }
        : null,
      voiceProfile: n.voiceProfile
        ? { ...n.voiceProfile, bins: n.voiceProfile.bins.slice() }
        : null,
      statusMessage: `エフェクト「${n.name}」を読み出しました`,
    });
    try {
      const engine = getAudioEngine();
      engine.applyMasterFx(n.master);
      engine.setLiveFx(
        assembleLiveFx(
          n.liveChain ?? [],
          n.filters,
          n.inserts,
          n.aiVoice ?? null,
          cableInserts,
          deviceInserts,
        ),
      );
      engine.setPipelineGraph(extraPipelines);
      engine.setRoomProfile(n.roomProfile);
      engine.setRoomAmount(n.roomAmount);
      engine.setVoiceProfile(n.voiceProfile);
      engine.setVoiceAmount(n.voiceAmount);
    } catch {
      /* not ready */
    }
  },

  captureRoomProfile: async () => {
    if (get().roomCapturing) return;
    if (!get().inputEnabled) {
      set({
        statusMessage: "入力がオフです。入力をオンにしてから部屋を覚えてください",
      });
      return;
    }
    set({
      roomCapturing: true,
      roomCaptureProgress: 0,
      statusMessage: "部屋を記憶中 — 歌わず、テレビや部屋の音だけ鳴らしてください",
    });
    try {
      const engine = getAudioEngine();
      engine.setInputDeviceId(get().inputDeviceId);
      const profile = await engine.captureRoomProfile(2.6, (p) => {
        set({ roomCaptureProgress: p });
      });
      const nextAmount = get().roomAmount > 0.05 ? get().roomAmount : 0.55;
      engine.setRoomAmount(nextAmount);
      set({
        roomProfile: profile,
        roomAmount: nextAmount,
        roomCaptureProgress: 1,
        statusMessage: "部屋を覚えました。スライダーでテレビ／部屋を引けます",
      });
    } catch (e) {
      console.error(e);
      set({
        statusMessage:
          e instanceof Error && e.message === "INPUT_DISABLED"
            ? "入力がオフです"
            : "部屋を覚えられませんでした。マイクを許可してください",
      });
    } finally {
      set({ roomCapturing: false });
    }
  },

  startRangeTest: async () => {
    if (get().rangeMeasuring || get().rangeBusy) return;
    if (!get().inputEnabled) {
      set({
        statusMessage:
          "入力がオフです。入力をオンにしてから測定してください",
      });
      return;
    }
    set({ rangeBusy: true });
    try {
      const engine = getAudioEngine();
      engine.setInputDeviceId(get().inputDeviceId);
      await engine.startPitchTap();
      set({
        rangeMeasuring: true,
        statusMessage: "声域測定中 — 安定して声を出してください",
      });
      startRangeLoop(get, set);
      void get().refreshAudioDevices({ requestPermission: false });
    } catch (e) {
      console.error(e);
      set({
        rangeMeasuring: false,
        statusMessage:
          e instanceof Error && e.message === "INPUT_DISABLED"
            ? "入力がオフです"
            : "マイクへのアクセスが拒否されました",
      });
    } finally {
      set({ rangeBusy: false });
    }
  },

  stopRangeTest: () => {
    stopRangeLoop();
    try {
      getAudioEngine().stopPitchTap();
    } catch {
      /* noop */
    }
    const s = get();
    const summary =
      s.rangeMinNote && s.rangeMaxNote
        ? `声域: ${s.rangeMinNote} 〜 ${s.rangeMaxNote}`
        : "声域測定を停止";
    set({
      rangeMeasuring: false,
      rangeCurrentHz: null,
      rangeCurrentNote: null,
      rangeCurrentConfidence: 0,
      rangeStable: false,
      rangeHoldProgress: 0,
      statusMessage: summary,
    });
  },

  resetRangeTest: () => {
    const was = get().rangeMeasuring;
    if (was) get().stopRangeTest();
    set({
      rangeMinHz: null,
      rangeMaxHz: null,
      rangeMinNote: null,
      rangeMaxNote: null,
      rangeCurrentHz: null,
      rangeCurrentNote: null,
      rangeCurrentConfidence: 0,
      rangeStable: false,
      rangeHoldProgress: 0,
      statusMessage: "声域データをリセットしました",
    });
  },

  setMediaRangeTrackId: (id) => set({ mediaRangeTrackId: id }),

  clearMediaRangeResult: () =>
    set({ mediaRangeResult: null, mediaRangeProgress: 0 }),

  analyzeMediaRange: async (opts) => {
    if (get().mediaRangeAnalyzing) return;
    const trackId =
      opts?.trackId ??
      get().mediaRangeTrackId ??
      get().activeTrackId ??
      get().tracks.find((t) => t.buffer)?.id ??
      null;
    const track = get().tracks.find((t) => t.id === trackId);
    if (!track?.buffer) {
      set({
        statusMessage:
          "解析する音源がありません。スタジオで音声／動画を読み込んでください",
      });
      return;
    }

    const isolateVocals = opts?.isolateVocals !== false;
    set({
      mediaRangeAnalyzing: true,
      mediaRangeProgress: 0,
      mediaRangeTrackId: track.id,
      statusMessage: isolateVocals
        ? `音源キャンセル → 声域解析中… ${track.name}`
        : `声域解析中… ${track.name}`,
    });

    try {
      if (get().status === "playing") get().pause();
      const engine = getAudioEngine();
      const ctx = engine.getContext();
      let buffer = track.buffer;

      if (isolateVocals) {
        try {
          // Keep original on track; analyze a temporary isolated copy
          buffer = processSeparation(track.buffer, "remove-instrumental", ctx);
        } catch (e) {
          // Mono: fall back to original
          console.warn(e);
          set({
            statusMessage:
              "ステレオ分離できないため、原音のまま解析します（" +
              (e instanceof Error ? e.message : "モノラル等") +
              "）",
          });
          buffer = track.buffer;
        }
      }

      const result = await analyzeBufferVocalRange(buffer, {
        onProgress: (p) => set({ mediaRangeProgress: p }),
      });

      if (!result) {
        set({
          mediaRangeResult: null,
          statusMessage:
            "安定した声を検出できませんでした。ボーカルがはっきりした音源で試してください",
        });
        return;
      }

      const full: MediaRangeResult = {
        ...result,
        usedVocalIsolation: isolateVocals,
        trackId: track.id,
        trackName: track.name,
      };
      set({
        mediaRangeResult: full,
        statusMessage: `音源の声域: ${full.minNote} 〜 ${full.maxNote}（${full.spanSemitones} 半音）`,
      });
    } catch (e) {
      console.error(e);
      set({
        mediaRangeResult: null,
        statusMessage:
          e instanceof Error ? e.message : "声域解析に失敗しました",
      });
    } finally {
      set({ mediaRangeAnalyzing: false, mediaRangeProgress: 1 });
    }
  },
}));
