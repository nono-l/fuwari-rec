import { create } from "zustand";
import {
  MIX_PRESETS,
  TRACK_COLORS,
  type MasterFx,
  type MixPresetId,
  type Track,
  type TrackKind,
} from "@/lib/audio/types";
import { getAudioEngine, type EngineStatus } from "@/lib/audio/engine";
import {
  cloneAudioBuffer,
  processSeparation,
  type SeparationMode,
} from "@/lib/audio/separation";
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
  renderMidiToAudioBuffer,
} from "@/lib/audio/midi";
import { isVideoFile } from "@/lib/audio/media-decode";
import {
  analyzeBufferVocalRange,
  type MediaRangeResult,
} from "@/lib/audio/range-analyze";
import {
  isYouTubePlayerReady,
  youtubeGetCurrentTime,
  youtubeGetDuration,
  youtubePause,
  youtubePlay,
  youtubeSeek,
  youtubeStop,
  youtubeSetMuted,
  setYouTubeEndedHandler,
} from "@/lib/youtube-player";
import { downloadBlob } from "@/lib/utils";

function uid() {
  return `t_${Math.random().toString(36).slice(2, 10)}`;
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
  };
}

let ytClockRaf = 0;
let liveMeterRaf = 0;
let rangeRaf = 0;
let deviceUnsub: (() => void) | null = null;

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
  loopEnabled: boolean;
  loopA: number | null;
  loopB: number | null;
  youtubeInput: string;
  youtubeVideoId: string | null;
  youtubeReady: boolean;
  youtubeSync: boolean;
  youtubePlayerEpoch: number;

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
  loadYoutube: (videoId: string) => void;
  clearYoutube: () => void;
  setYoutubeReady: (ready: boolean) => void;
  setYoutubeSync: (sync: boolean) => void;
  applySeparation: (mode: SeparationMode) => Promise<void>;
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

    const ytTime = youtubeGetCurrentTime();
    const ytDur = youtubeGetDuration();
    const audioOnly = hasAudioBuffers(s.tracks);

    if (!audioOnly) {
      set({
        currentTime: ytTime,
        duration: Math.max(s.duration, ytDur),
      });
    } else if (ytDur > 0 && ytDur > s.duration) {
      set({ duration: ytDur });
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
  if (!s.youtubeSync || !s.youtubeVideoId || !isYouTubePlayerReady())
    return false;
  youtubeSeek(s.currentTime);
  youtubeSetMuted(!s.outputEnabled);
  return youtubePlay();
}

function syncYoutubePause(get: () => EditorState) {
  const s = get();
  if (!s.youtubeSync || !s.youtubeVideoId) return;
  youtubePause();
}

function syncYoutubeStop(get: () => EditorState) {
  const s = get();
  if (!s.youtubeSync || !s.youtubeVideoId) return;
  youtubeStop();
}

export const useEditorStore = create<EditorState>((set, get) => ({
  ready: false,
  tracks: [],
  activeTrackId: null,
  status: "idle",
  currentTime: 0,
  duration: 0,
  bpm: 120,
  master: {
    volume: 1,
    pitchSemitones: 0,
    formantDb: 0,
    reverbMix: 0.15,
    compressor: 0.3,
    preset: "original",
  },
  statusMessage: "準備完了",
  isExporting: false,
  isSeparating: false,
  isLoadingMidi: false,
  isLoadingMedia: false,
  loopEnabled: false,
  loopA: null,
  loopB: null,
  youtubeInput: "",
  youtubeVideoId: null,
  youtubeReady: false,
  youtubeSync: true,
  youtubePlayerEpoch: 0,

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
        if (hasAudioBuffers(get().tracks)) {
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
    engine.setInputEnabled(get().inputEnabled);
    engine.setOutputEnabled(get().outputEnabled);

    set({
      outputSelectSupported:
        supportsOutputSinkSelection() || engine.supportsOutputSelection(),
    });

    setYouTubeEndedHandler(() => {
      const s = get();
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
      if (parsed.notes.length === 0) {
        set({ statusMessage: "MIDI に再生できるノートがありません" });
        return;
      }
      const engine = getAudioEngine();
      const sampleRate = engine.getSampleRate();
      const buffer = await renderMidiToAudioBuffer(parsed, sampleRate);

      let trackId = id;
      if (!trackId) {
        const empty = get().tracks.find(
          (t) => t.kind === "accompaniment" && !t.buffer,
        );
        trackId =
          empty?.id ??
          get().addTrack({
            name: parsed.name || file.name.replace(/\.[^/.]+$/, "") || "MIDI",
            kind: "accompaniment",
          });
      }
      const baseName =
        parsed.name || file.name.replace(/\.[^/.]+$/, "") || "MIDI";
      get().updateTrack(trackId, {
        buffer,
        undoBuffer: null,
        name: baseName,
        kind: "accompaniment",
        offset: 0,
      });
      engine.updateDuration(get().tracks);
      set({
        duration: engine.getDuration(),
        activeTrackId: trackId,
        mediaRangeTrackId: trackId,
        statusMessage: `MIDI 読み込み完了: ${baseName}（${parsed.notes.length} ノート）— 再生できます`,
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

  seek: (time) => {
    const { status, youtubeSync, youtubeVideoId } = get();
    const engine = getAudioEngine();
    const wasPlaying = status === "playing";
    if (wasPlaying) {
      engine.pause();
      if (youtubeSync && youtubeVideoId) youtubePause();
      stopYtClock();
    }
    engine.setCurrentTime(time);
    set({ currentTime: time });
    if (youtubeSync && youtubeVideoId && isYouTubePlayerReady()) {
      youtubeSeek(time);
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
        yt ? youtubeGetDuration() : 0,
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
      await engine.startRecording({ monitor: true });
      if (get().youtubeSync && get().youtubeVideoId) {
        syncYoutubePlay(get);
        startYtClock(get, set);
      }
      set({
        status: "recording",
        statusMessage: get().outputEnabled ? "録音中…" : "録音中（出力オフ）",
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
      const buffer = await engine.stopRecording();
      syncYoutubePause(get);
      stopYtClock();
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
      if (!active || active.buffer || active.kind === "accompaniment") {
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
      get().updateTrack(id!, { buffer, undoBuffer: null, offset: 0 });
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
      const master = { ...s.master, ...patch };
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
      const blob = await getAudioEngine().exportMix(tracks, master);
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

  loadYoutube: (videoId) => {
    set((s) => ({
      youtubeVideoId: videoId,
      youtubeReady: false,
      youtubePlayerEpoch: s.youtubePlayerEpoch + 1,
      statusMessage: "YouTube を読み込み中…",
    }));
  },

  clearYoutube: () => {
    if (get().status === "playing" || get().status === "recording") {
      youtubePause();
    }
    stopYtClock();
    set({
      youtubeVideoId: null,
      youtubeReady: false,
      youtubePlayerEpoch: get().youtubePlayerEpoch + 1,
      statusMessage: "YouTube パネルを閉じました",
    });
  },

  setYoutubeReady: (ready) => {
    set({
      youtubeReady: ready,
      statusMessage: ready
        ? "YouTube 準備完了 — 再生ボタンで同期再生できます"
        : get().statusMessage,
    });
    if (ready && isYouTubePlayerReady()) {
      const d = youtubeGetDuration();
      if (d > 0) {
        set({ duration: Math.max(get().duration, d) });
      }
      youtubeSetMuted(!get().outputEnabled);
    }
  },

  setYoutubeSync: (sync) => {
    set({ youtubeSync: sync });
    if (!sync) {
      youtubePause();
      set({ statusMessage: "YouTube 同期オフ" });
    } else {
      set({ statusMessage: "YouTube 同期オン（再生ボタン連動）" });
    }
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
    youtubeSetMuted(!enabled);
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
