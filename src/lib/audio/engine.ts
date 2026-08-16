import type { MasterFx, Track } from "./types";
import { audioBufferToWav } from "./wav-export";
import { decodeMediaFile } from "./media-decode";
import {
  startMidiVoice,
  type LiveVoice,
  type MidiInstrumentId,
} from "./midi-instruments";
import {
  ROOM_FFT,
  subtractRoomFromBuffer,
  type RoomProfile,
} from "./room-profile";
import roomWorkletUrl from "./worklets/room-subtract.js?url";

function createImpulse(ctx: BaseAudioContext, duration = 1.8, decay = 2.2) {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * duration);
  const impulse = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

function noiseParams(amount: number) {
  const a = Math.max(0, Math.min(1, amount));
  return {
    amount: a,
    hp: 20 + a * 160,
    lp: 20000 - a * 7000,
    gateOn: a > 0.02,
    open: 0.007 + a * 0.05,
    floor: Math.max(0.06, 1 - a * 0.9),
  };
}

function gateAudioBuffer(buffer: AudioBuffer, amount: number): AudioBuffer {
  const p = noiseParams(amount);
  if (!p.gateOn) return buffer;
  const out = new AudioBuffer({
    length: buffer.length,
    sampleRate: buffer.sampleRate,
    numberOfChannels: buffer.numberOfChannels,
  });
  const chans = Array.from({ length: buffer.numberOfChannels }, (_, i) =>
    buffer.getChannelData(i),
  );
  const dests = Array.from({ length: buffer.numberOfChannels }, (_, i) =>
    out.getChannelData(i),
  );
  let env = 0;
  let gain = 1;
  for (let i = 0; i < buffer.length; i++) {
    let sq = 0;
    for (const ch of chans) {
      const s = ch[i] ?? 0;
      sq += s * s;
    }
    const rms = Math.sqrt(sq / chans.length);
    env = env * 0.92 + rms * 0.08;
    const target = env > p.open ? 1 : p.floor;
    const coeff = target > gain ? 0.28 : 0.06;
    gain += (target - gain) * coeff;
    for (let c = 0; c < dests.length; c++) {
      dests[c]![i] = (chans[c]![i] ?? 0) * gain;
    }
  }
  return out;
}

export type EngineStatus = "idle" | "playing" | "recording";

export interface EngineSnapshot {
  currentTime: number;
  duration: number;
  status: EngineStatus;
}

type AudioContextWithSink = AudioContext & {
  setSinkId?: (sinkId: string) => Promise<void>;
  sinkId?: string;
};

/**
 * Client-side Web Audio engine.
 * Master FX bus is a live effector: mic and tracks share the same chain.
 */
export class AudioEngine {
  private ctx: AudioContextWithSink | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private highShelf: BiquadFilterNode | null = null;
  private noiseHp: BiquadFilterNode | null = null;
  private noiseLp: BiquadFilterNode | null = null;
  private gateGain: GainNode | null = null;
  private gateAnalyser: AnalyserNode | null = null;
  private gateData: Uint8Array | null = null;
  private noiseAmount = 0;
  private gateSmoothed = 1;
  private roomPre: GainNode | null = null;
  private roomPost: GainNode | null = null;
  private roomNode: AudioWorkletNode | null = null;
  private roomProfile: RoomProfile | null = null;
  private roomAmount = 0;
  private roomWorkletReady = false;
  private tapVoice: LiveVoice | null = null;
  private tapInstrument: MidiInstrumentId = "piano";
  private reverb: ConvolverNode | null = null;
  private dryGain: GainNode | null = null;
  private wetGain: GainNode | null = null;
  private bus: GainNode | null = null;

  private sources = new Map<string, AudioBufferSourceNode>();
  private trackGains = new Map<string, GainNode>();
  private trackPans = new Map<string, StereoPannerNode>();

  private inputStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private recPunchIn = 0;
  /** Transport-only recording (no mic) for rhythm MIDI input */
  private transportOnly = false;

  private liveSource: MediaStreamAudioSourceNode | null = null;
  private liveGain: GainNode | null = null;
  private liveActive = false;
  private liveLevel = 0;
  private analyser: AnalyserNode | null = null;
  private levelRaf = 0;
  private levelData: Uint8Array | null = null;

  private pitchSource: MediaStreamAudioSourceNode | null = null;
  private pitchAnalyser: AnalyserNode | null = null;
  private pitchBuffer: Float32Array | null = null;
  private pitchTapActive = false;

  private monitorNode: MediaStreamAudioSourceNode | null = null;
  private monitorGain: GainNode | null = null;

  private status: EngineStatus = "idle";
  private playStartCtxTime = 0;
  private playStartOffset = 0;
  private currentTime = 0;
  private duration = 0;
  private raf = 0;
  private pitchRate = 1;
  private masterVolume = 1;

  private inputDeviceId = "";
  private outputDeviceId = "";
  private inputEnabled = true;
  private outputEnabled = true;

  private onTick: ((s: EngineSnapshot) => void) | null = null;
  private onStatus: ((s: EngineStatus) => void) | null = null;

  setHandlers(opts: {
    onTick?: (s: EngineSnapshot) => void;
    onStatus?: (s: EngineStatus) => void;
  }) {
    this.onTick = opts.onTick ?? null;
    this.onStatus = opts.onStatus ?? null;
  }

  getContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext() as AudioContextWithSink;
      this.buildGraph();
      if (this.outputDeviceId) {
        void this.applyOutputDevice(this.outputDeviceId);
      }
      this.applyOutputMute();
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  getSampleRate() {
    return this.getContext().sampleRate;
  }

  getInputDeviceId() {
    return this.inputDeviceId;
  }

  getOutputDeviceId() {
    return this.outputDeviceId;
  }

  isInputEnabled() {
    return this.inputEnabled;
  }

  isOutputEnabled() {
    return this.outputEnabled;
  }

  isLiveFxActive() {
    return this.liveActive;
  }

  isPitchTapActive() {
    return this.pitchTapActive;
  }

  getLiveLevel() {
    return this.liveLevel;
  }

  isTransportOnly() {
    return this.transportOnly;
  }

  setInputDeviceId(deviceId: string) {
    this.inputDeviceId = deviceId || "";
  }

  async setOutputDeviceId(deviceId: string): Promise<void> {
    this.outputDeviceId = deviceId || "";
    if (this.ctx) {
      await this.applyOutputDevice(this.outputDeviceId);
    }
  }

  setInputEnabled(enabled: boolean) {
    this.inputEnabled = enabled;
    this.applyInputMute();
  }

  setOutputEnabled(enabled: boolean) {
    this.outputEnabled = enabled;
    this.applyOutputMute();
  }

  private applyInputMute() {
    const live = this.inputEnabled;
    if (this.inputStream) {
      for (const t of this.inputStream.getAudioTracks()) {
        t.enabled = live;
      }
    }
    if (this.liveGain) {
      this.liveGain.gain.value = live && this.liveActive ? 0.95 : 0;
    }
    if (this.monitorGain) {
      this.monitorGain.gain.value = live ? 0.35 : 0;
    }
  }

  private applyOutputMute() {
    if (!this.masterGain) return;
    this.masterGain.gain.value = this.outputEnabled ? this.masterVolume : 0;
  }

  private async applyOutputDevice(deviceId: string) {
    const ctx = this.ctx;
    if (!ctx?.setSinkId) {
      throw new Error(
        "このブラウザは出力デバイス選択（setSinkId）に未対応です。Chrome / Edge をお試しください。",
      );
    }
    await ctx.setSinkId(deviceId);
  }

  supportsOutputSelection() {
    if (typeof window === "undefined") return false;
    const proto = AudioContext.prototype as AudioContextWithSink;
    return typeof proto.setSinkId === "function";
  }

  private buildGraph() {
    const ctx = this.ctx!;
    this.bus = ctx.createGain();
    this.bus.gain.value = 1;

    this.roomPre = ctx.createGain();
    this.roomPre.gain.value = 1;
    this.roomPost = ctx.createGain();
    this.roomPost.gain.value = 1;

    this.noiseHp = ctx.createBiquadFilter();
    this.noiseHp.type = "highpass";
    this.noiseHp.frequency.value = 20;
    this.noiseHp.Q.value = 0.7;

    this.noiseLp = ctx.createBiquadFilter();
    this.noiseLp.type = "lowpass";
    this.noiseLp.frequency.value = 20000;
    this.noiseLp.Q.value = 0.7;

    this.gateGain = ctx.createGain();
    this.gateGain.gain.value = 1;

    this.gateAnalyser = ctx.createAnalyser();
    this.gateAnalyser.fftSize = 512;
    this.gateAnalyser.smoothingTimeConstant = 0.3;
    this.gateData = new Uint8Array(this.gateAnalyser.fftSize);

    this.highShelf = ctx.createBiquadFilter();
    this.highShelf.type = "highshelf";
    this.highShelf.frequency.value = 3200;
    this.highShelf.gain.value = 0;

    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -24;
    this.compressor.knee.value = 12;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.01;
    this.compressor.release.value = 0.25;

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = createImpulse(ctx);

    this.dryGain = ctx.createGain();
    this.wetGain = ctx.createGain();
    this.dryGain.gain.value = 0.85;
    this.wetGain.gain.value = 0.15;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.8;
    this.levelData = new Uint8Array(this.analyser.frequencyBinCount);

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.outputEnabled ? this.masterVolume : 0;

    this.bus.connect(this.roomPre);
    this.roomPre.connect(this.roomPost);
    this.roomPost.connect(this.noiseHp);
    this.noiseHp.connect(this.noiseLp);
    this.noiseLp.connect(this.gateGain);
    this.noiseHp.connect(this.gateAnalyser);
    this.gateGain.connect(this.highShelf);
    this.highShelf.connect(this.compressor);
    this.compressor.connect(this.dryGain);
    this.compressor.connect(this.reverb);
    this.reverb.connect(this.wetGain);
    this.dryGain.connect(this.analyser);
    this.wetGain.connect(this.analyser);
    this.analyser.connect(this.masterGain);
    this.masterGain.connect(ctx.destination);
  }

  applyMasterFx(fx: MasterFx) {
    this.getContext();
    this.masterVolume = fx.volume;
    this.applyOutputMute();
    if (this.highShelf) this.highShelf.gain.value = fx.formantDb;
    if (this.dryGain && this.wetGain) {
      this.dryGain.gain.value = 1 - fx.reverbMix;
      this.wetGain.gain.value = fx.reverbMix;
    }
    if (this.compressor) {
      this.compressor.threshold.value = -12 - fx.compressor * 24;
      this.compressor.ratio.value = 2 + fx.compressor * 10;
    }
    this.applyNoiseAmount(fx.noise ?? 0);
    this.pitchRate = Math.pow(2, fx.pitchSemitones / 12);
    void this.ensureRoomWorklet();
  }

  private applyNoiseAmount(amount: number) {
    this.noiseAmount = Math.max(0, Math.min(1, amount));
    const p = noiseParams(this.noiseAmount);
    if (this.noiseHp) this.noiseHp.frequency.value = p.hp;
    if (this.noiseLp) this.noiseLp.frequency.value = p.lp;
    if (!p.gateOn && this.gateGain) {
      this.gateSmoothed = 1;
      this.gateGain.gain.value = 1;
    }
  }

  private tickNoiseGate() {
    if (!this.gateAnalyser || !this.gateData || !this.gateGain) return;
    const p = noiseParams(this.noiseAmount);
    if (!p.gateOn) {
      if (this.gateSmoothed !== 1) {
        this.gateSmoothed = 1;
        this.gateGain.gain.setTargetAtTime(1, this.ctx?.currentTime ?? 0, 0.02);
      }
      return;
    }
    // @ts-expect-error TS lib sometimes wants ArrayBufferView strictness
    this.gateAnalyser.getByteTimeDomainData(this.gateData);
    let acc = 0;
    for (let i = 0; i < this.gateData.length; i++) {
      const v = (this.gateData[i]! - 128) / 128;
      acc += v * v;
    }
    const rms = Math.sqrt(acc / this.gateData.length);
    const target = rms > p.open ? 1 : p.floor;
    const coeff = target > this.gateSmoothed ? 0.32 : 0.07;
    this.gateSmoothed += (target - this.gateSmoothed) * coeff;
    this.gateGain.gain.setTargetAtTime(
      this.gateSmoothed,
      this.ctx?.currentTime ?? 0,
      0.015,
    );
  }

  private async ensureRoomWorklet() {
    if (this.roomWorkletReady || !this.ctx) return;
    if (typeof AudioWorkletNode === "undefined") return;
    try {
      await this.ctx.audioWorklet.addModule(roomWorkletUrl);
      this.roomWorkletReady = true;
      this.attachRoomNode();
    } catch {
      this.roomWorkletReady = false;
    }
  }

  private attachRoomNode() {
    if (!this.ctx || !this.roomPre || !this.roomPost || !this.roomWorkletReady) {
      return;
    }
    if (this.roomNode) return;
    try {
      this.roomNode = new AudioWorkletNode(this.ctx, "room-subtract", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
    } catch {
      return;
    }
    try {
      this.roomPre.disconnect();
    } catch {
      /* noop */
    }
    this.roomPre.connect(this.roomNode);
    this.roomNode.connect(this.roomPost);
    this.pushRoomToWorklet();
  }

  private pushRoomToWorklet() {
    if (!this.roomNode) return;
    if (this.roomProfile?.bins.length) {
      this.roomNode.port.postMessage({
        type: "profile",
        bins: this.roomProfile.bins,
      });
    } else {
      this.roomNode.port.postMessage({ type: "clear" });
    }
    this.roomNode.port.postMessage({ type: "amount", value: this.roomAmount });
  }

  setRoomAmount(amount: number) {
    this.roomAmount = Math.max(0, Math.min(1, amount));
    this.pushRoomToWorklet();
  }

  setRoomProfile(profile: RoomProfile | null) {
    this.roomProfile = profile;
    this.pushRoomToWorklet();
  }

  async captureRoomProfile(
    durationSec = 2.6,
    onProgress?: (p: number) => void,
  ): Promise<RoomProfile> {
    const ctx = this.getContext();
    await this.ensureRoomWorklet();
    const stream = await this.ensureInputStream();
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = ROOM_FFT;
    an.smoothingTimeConstant = 0;
    src.connect(an);
    const count = an.frequencyBinCount;
    const acc = new Float64Array(count);
    const tmp = new Float32Array(count);
    const started = performance.now();
    const total = durationSec * 1000;
    let frames = 0;

    await new Promise<void>((resolve) => {
      const tick = () => {
        an.getFloatFrequencyData(tmp);
        for (let i = 0; i < count; i++) {
          const db = tmp[i] ?? -100;
          acc[i]! += db > -92 ? 10 ** (db / 20) : 0;
        }
        frames += 1;
        const elapsed = performance.now() - started;
        onProgress?.(Math.min(1, elapsed / total));
        if (elapsed < total) requestAnimationFrame(tick);
        else resolve();
      };
      tick();
    });

    try {
      src.disconnect();
    } catch {
      /* noop */
    }
    this.maybeReleaseInputStream();

    const bins = Array.from(acc, (v) => (v / Math.max(1, frames)) * 1.12);
    const profile: RoomProfile = {
      bins,
      fftSize: ROOM_FFT,
      frames,
      capturedAt: Date.now(),
    };
    this.setRoomProfile(profile);
    return profile;
  }

  updateDuration(tracks: Track[]) {
    let max = 0;
    for (const t of tracks) {
      if (t.buffer) max = Math.max(max, t.offset + t.buffer.duration);
    }
    this.duration = max;
  }

  setCurrentTime(t: number) {
    this.currentTime = Math.max(0, t);
    this.emitTick();
  }

  getCurrentTime() {
    return this.currentTime;
  }

  setTapInstrument(id: MidiInstrumentId) {
    this.tapInstrument = id;
  }

  tapNoteOn(midi: number, velocity = 0.75) {
    this.tapNoteOff();
    const ctx = this.getContext();
    if (!this.bus) return;
    this.tapVoice = startMidiVoice(ctx, this.bus, {
      midi,
      velocity,
      t0: ctx.currentTime,
      duration: 8,
      instrument: this.tapInstrument,
    });
  }

  tapNoteOff() {
    if (this.tapVoice) {
      this.tapVoice.stop();
      this.tapVoice = null;
    }
  }

  getDuration() {
    return this.duration;
  }

  getStatus() {
    return this.status;
  }

  getRecPunchIn() {
    return this.recPunchIn;
  }

  private setStatus(s: EngineStatus) {
    this.status = s;
    this.onStatus?.(s);
  }

  private emitTick() {
    this.onTick?.({
      currentTime: this.currentTime,
      duration: this.duration,
      status: this.status,
    });
  }

  private stopSources() {
    for (const src of this.sources.values()) {
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
      try {
        src.disconnect();
      } catch {
        /* noop */
      }
    }
    this.sources.clear();
    this.trackGains.clear();
    this.trackPans.clear();
  }

  private beginTransport(tracks: Track[], status: EngineStatus) {
    const ctx = this.getContext();
    this.stopSources();
    this.updateDuration(tracks);

    this.playStartOffset = this.currentTime;
    this.playStartCtxTime = ctx.currentTime;
    this.setStatus(status);

    const anySolo = tracks.some((t) => t.solo);
    for (const track of tracks) {
      if (!track.buffer) continue;
      if (track.muted) continue;
      if (anySolo && !track.solo) continue;

      const source = ctx.createBufferSource();
      source.buffer = track.buffer;
      source.playbackRate.value = this.pitchRate;

      const gain = ctx.createGain();
      gain.gain.value = track.volume;

      const pan = ctx.createStereoPanner();
      pan.pan.value = track.pan;

      source.connect(gain);
      gain.connect(pan);
      pan.connect(this.bus!);

      this.sources.set(track.id, source);
      this.trackGains.set(track.id, gain);
      this.trackPans.set(track.id, pan);

      const startOffset = Math.max(0, this.currentTime - track.offset);
      const when =
        ctx.currentTime + Math.max(0, track.offset - this.currentTime);
      if (startOffset < track.buffer.duration) {
        source.start(when, startOffset);
      }
    }

    this.tick();
  }

  /**
   * Advance the transport clock without opening the microphone.
   * Used by rhythm MIDI input so time runs even with no tracks / no mic.
   */
  startTransportClock(tracks: Track[], as: EngineStatus = "recording") {
    if (this.status === "recording" && this.mediaRecorder) {
      // Mic recording already owns the clock
      return;
    }
    if (this.status === "playing" || this.status === "recording") {
      if (as === "recording") this.setStatus("recording");
      this.transportOnly = !this.mediaRecorder;
      this.emitTick();
      return;
    }
    this.transportOnly = true;
    this.recPunchIn = this.currentTime;
    this.beginTransport(tracks, as);
  }

  /** Stop transport-only clock (no MediaRecorder teardown). */
  stopTransportClock() {
    if (!this.transportOnly && this.mediaRecorder) return;
    if (this.status !== "playing" && this.status !== "recording") return;
    const ctx = this.ctx;
    if (ctx) {
      this.currentTime =
        this.playStartOffset + (ctx.currentTime - this.playStartCtxTime);
    }
    this.stopSources();
    cancelAnimationFrame(this.raf);
    this.transportOnly = false;
    this.setStatus("idle");
    this.emitTick();
  }

  play(tracks: Track[]) {
    if (this.status === "recording") return;
    this.transportOnly = false;
    this.updateDuration(tracks);
    if (this.duration <= 0) return;
    this.beginTransport(tracks, "playing");
  }

  pause() {
    if (this.status !== "playing" && this.status !== "recording") return;
    if (this.status === "recording" && this.mediaRecorder) return;
    const ctx = this.ctx;
    if (ctx) {
      this.currentTime =
        this.playStartOffset + (ctx.currentTime - this.playStartCtxTime);
    }
    this.stopSources();
    cancelAnimationFrame(this.raf);
    this.transportOnly = false;
    this.setStatus("idle");
    this.emitTick();
  }

  stop() {
    if (this.status === "recording" && this.mediaRecorder) return;
    this.pause();
    this.currentTime = 0;
    this.emitTick();
  }

  private tick = () => {
    if (
      (this.status !== "playing" && this.status !== "recording") ||
      !this.ctx
    ) {
      return;
    }
    const elapsed = this.ctx.currentTime - this.playStartCtxTime;
    this.currentTime = this.playStartOffset + elapsed;
    if (this.status === "recording" && this.currentTime > this.duration) {
      this.duration = this.currentTime;
    }
    if (
      this.status === "playing" &&
      this.duration > 0 &&
      this.currentTime >= this.duration
    ) {
      this.currentTime = this.duration;
      this.stopSources();
      cancelAnimationFrame(this.raf);
      this.transportOnly = false;
      this.setStatus("idle");
      this.emitTick();
      return;
    }
    this.emitTick();
    this.raf = requestAnimationFrame(this.tick);
  };

  updateLiveTrackParams(track: Track) {
    const g = this.trackGains.get(track.id);
    if (g) g.gain.value = track.muted ? 0 : track.volume;
    const p = this.trackPans.get(track.id);
    if (p) p.pan.value = track.pan;
  }

  async decodeFile(file: File): Promise<AudioBuffer> {
    const ctx = this.getContext();
    return decodeMediaFile(file, ctx);
  }

  private async openInputStream(): Promise<MediaStream> {
    const audioConstraints: MediaTrackConstraints = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    };
    if (this.inputDeviceId) {
      audioConstraints.deviceId = { exact: this.inputDeviceId };
    }
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
      });
    } catch (err) {
      if (this.inputDeviceId) {
        return navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
      }
      throw err;
    }
  }

  private async ensureInputStream(): Promise<MediaStream> {
    if (this.inputStream) {
      const alive = this.inputStream
        .getAudioTracks()
        .some((t) => t.readyState === "live");
      if (alive) return this.inputStream;
      this.teardownPitchTapNodes();
      this.releaseInputStreamTracks();
    }
    this.inputStream = await this.openInputStream();
    this.applyInputMute();
    return this.inputStream;
  }

  private releaseInputStreamTracks() {
    if (this.inputStream) {
      this.inputStream.getTracks().forEach((t) => t.stop());
      this.inputStream = null;
    }
  }

  private maybeReleaseInputStream() {
    if (
      this.liveActive ||
      this.status === "recording" ||
      this.pitchTapActive
    ) {
      return;
    }
    this.teardownPitchTapNodes();
    this.releaseInputStreamTracks();
  }

  private startLevelMeter() {
    if (this.levelRaf) return;
    const loop = () => {
      if (!this.analyser || !this.levelData) {
        this.levelRaf = 0;
        return;
      }
      if (
        !this.liveActive &&
        this.status !== "recording" &&
        this.status !== "playing"
      ) {
        this.liveLevel = 0;
        this.levelRaf = 0;
        return;
      }
      // @ts-expect-error TS lib sometimes wants ArrayBufferView strictness
      this.analyser.getByteTimeDomainData(this.levelData);
      let peak = 0;
      for (let i = 0; i < this.levelData.length; i++) {
        const v = Math.abs((this.levelData[i]! - 128) / 128);
        if (v > peak) peak = v;
      }
      this.liveLevel = peak;
      this.tickNoiseGate();
      this.levelRaf = requestAnimationFrame(loop);
    };
    this.levelRaf = requestAnimationFrame(loop);
  }

  private stopLevelMeterIfIdle() {
    if (
      this.liveActive ||
      this.status === "recording" ||
      this.status === "playing"
    ) {
      this.startLevelMeter();
      return;
    }
    if (this.levelRaf) {
      cancelAnimationFrame(this.levelRaf);
      this.levelRaf = 0;
    }
    this.liveLevel = 0;
    this.gateSmoothed = 1;
    if (this.gateGain) this.gateGain.gain.value = 1;
  }

  async startLiveFx(): Promise<void> {
    if (this.liveActive) return;
    if (!this.inputEnabled) {
      throw new Error("INPUT_DISABLED");
    }
    const ctx = this.getContext();
    await this.ensureRoomWorklet();
    const stream = await this.ensureInputStream();

    this.disconnectMonitorOnly();

    this.liveSource = ctx.createMediaStreamSource(stream);
    this.liveGain = ctx.createGain();
    this.liveGain.gain.value = this.inputEnabled ? 0.95 : 0;
    this.liveSource.connect(this.liveGain);
    this.liveGain.connect(this.bus!);
    this.liveActive = true;
    this.startLevelMeter();
  }

  stopLiveFx() {
    if (!this.liveActive && !this.liveSource) return;
    this.liveActive = false;
    if (this.liveSource) {
      try {
        this.liveSource.disconnect();
      } catch {
        /* noop */
      }
      this.liveSource = null;
    }
    if (this.liveGain) {
      try {
        this.liveGain.disconnect();
      } catch {
        /* noop */
      }
      this.liveGain = null;
    }
    this.maybeReleaseInputStream();
    this.stopLevelMeterIfIdle();
  }

  async restartLiveFxIfActive(): Promise<void> {
    if (!this.liveActive) return;
    const wasPitch = this.pitchTapActive;
    this.stopLiveFx();
    if (wasPitch) this.stopPitchTap();
    await this.startLiveFx();
    if (wasPitch) await this.startPitchTap();
  }

  async startPitchTap(): Promise<void> {
    if (this.pitchTapActive && this.pitchAnalyser) return;
    if (!this.inputEnabled) throw new Error("INPUT_DISABLED");
    const ctx = this.getContext();
    const stream = await this.ensureInputStream();

    this.teardownPitchTapNodes();
    this.pitchAnalyser = ctx.createAnalyser();
    this.pitchAnalyser.fftSize = 2048;
    this.pitchAnalyser.smoothingTimeConstant = 0.2;
    this.pitchBuffer = new Float32Array(this.pitchAnalyser.fftSize);
    this.pitchSource = ctx.createMediaStreamSource(stream);
    this.pitchSource.connect(this.pitchAnalyser);
    this.pitchTapActive = true;
  }

  stopPitchTap() {
    this.pitchTapActive = false;
    this.teardownPitchTapNodes();
    this.maybeReleaseInputStream();
  }

  private teardownPitchTapNodes() {
    if (this.pitchSource) {
      try {
        this.pitchSource.disconnect();
      } catch {
        /* noop */
      }
      this.pitchSource = null;
    }
    if (this.pitchAnalyser) {
      try {
        this.pitchAnalyser.disconnect();
      } catch {
        /* noop */
      }
      this.pitchAnalyser = null;
    }
    this.pitchBuffer = null;
  }

  readPitchTimeDomain(): Float32Array | null {
    if (!this.pitchTapActive || !this.pitchAnalyser || !this.pitchBuffer) {
      return null;
    }
    // @ts-expect-error Float32Array typing variance across TS lib versions
    this.pitchAnalyser.getFloatTimeDomainData(this.pitchBuffer);
    return this.pitchBuffer;
  }

  private disconnectMonitorOnly() {
    if (this.monitorNode) {
      try {
        this.monitorNode.disconnect();
      } catch {
        /* noop */
      }
      this.monitorNode = null;
    }
    if (this.monitorGain) {
      try {
        this.monitorGain.disconnect();
      } catch {
        /* noop */
      }
      this.monitorGain = null;
    }
  }

  async startRecording(
    tracks: Track[],
    opts?: { monitor?: boolean },
  ): Promise<number> {
    if (this.status === "recording" && this.mediaRecorder) {
      return this.recPunchIn;
    }
    if (!this.inputEnabled) {
      throw new Error("INPUT_DISABLED");
    }

    // If a transport-only rhythm session is running, fold into mic recording
    if (this.transportOnly && this.status === "recording") {
      this.transportOnly = false;
    }

    const ctx = this.getContext();
    const wasPlaying = this.status === "playing";
    this.recPunchIn = this.currentTime;

    const stream = await this.ensureInputStream();

    if (!this.liveActive && opts?.monitor !== false) {
      this.disconnectMonitorOnly();
      this.monitorNode = ctx.createMediaStreamSource(stream);
      this.monitorGain = ctx.createGain();
      this.monitorGain.gain.value = this.inputEnabled ? 0.35 : 0;
      this.monitorNode.connect(this.monitorGain);
      this.monitorGain.connect(this.bus!);
    }

    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";

    this.mediaRecorder = new MediaRecorder(
      stream,
      mime ? { mimeType: mime } : undefined,
    );
    this.recordedChunks = [];
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.recordedChunks.push(e.data);
    };
    this.mediaRecorder.start(100);
    this.transportOnly = false;

    if (!wasPlaying && this.status !== "recording") {
      this.beginTransport(tracks, "recording");
    } else {
      this.setStatus("recording");
      if (!this.raf) this.tick();
    }
    this.startLevelMeter();
    return this.recPunchIn;
  }

  async stopRecording(): Promise<AudioBuffer | null> {
    // Transport-only rhythm session: stop clock, no mic buffer
    if (this.transportOnly && this.status === "recording") {
      this.stopTransportClock();
      return null;
    }

    if (!this.mediaRecorder || this.status !== "recording") return null;

    const recorder = this.mediaRecorder;
    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        resolve(
          new Blob(this.recordedChunks, {
            type: recorder.mimeType || "audio/webm",
          }),
        );
      };
      recorder.stop();
    });

    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.disconnectMonitorOnly();
    this.stopSources();
    cancelAnimationFrame(this.raf);
    this.transportOnly = false;
    this.setStatus("idle");
    this.maybeReleaseInputStream();
    this.stopLevelMeterIfIdle();

    try {
      const ab = await blob.arrayBuffer();
      return await this.getContext().decodeAudioData(ab.slice(0));
    } catch {
      return null;
    }
  }

  async exportMix(
    tracks: Track[],
    fx: MasterFx,
    room?: { profile: RoomProfile | null; amount: number },
  ): Promise<Blob> {
    this.updateDuration(tracks);
    if (this.duration <= 0) {
      throw new Error("書き出す音源がありません");
    }

    const sampleRate = this.getContext().sampleRate;
    const length = Math.ceil(this.duration * sampleRate);
    const offline = new OfflineAudioContext(2, length, sampleRate);

    const bus = offline.createGain();
    const np = noiseParams(fx.noise ?? 0);
    const noiseHp = offline.createBiquadFilter();
    noiseHp.type = "highpass";
    noiseHp.frequency.value = np.hp;
    noiseHp.Q.value = 0.7;
    const noiseLp = offline.createBiquadFilter();
    noiseLp.type = "lowpass";
    noiseLp.frequency.value = np.lp;
    noiseLp.Q.value = 0.7;

    const highShelf = offline.createBiquadFilter();
    highShelf.type = "highshelf";
    highShelf.frequency.value = 3200;
    highShelf.gain.value = fx.formantDb;

    const compressor = offline.createDynamicsCompressor();
    compressor.threshold.value = -12 - fx.compressor * 24;
    compressor.knee.value = 12;
    compressor.ratio.value = 2 + fx.compressor * 10;
    compressor.attack.value = 0.01;
    compressor.release.value = 0.25;

    const reverb = offline.createConvolver();
    reverb.buffer = createImpulse(offline);
    const dry = offline.createGain();
    const wet = offline.createGain();
    dry.gain.value = 1 - fx.reverbMix;
    wet.gain.value = fx.reverbMix;

    const master = offline.createGain();
    master.gain.value = fx.volume;

    bus.connect(noiseHp);
    noiseHp.connect(noiseLp);
    noiseLp.connect(highShelf);
    highShelf.connect(compressor);
    compressor.connect(dry);
    compressor.connect(reverb);
    reverb.connect(wet);
    dry.connect(master);
    wet.connect(master);
    master.connect(offline.destination);

    const rate = Math.pow(2, fx.pitchSemitones / 12);
    const anySolo = tracks.some((t) => t.solo);
    const roomAmt = room?.amount ?? 0;

    for (const track of tracks) {
      if (!track.buffer) continue;
      if (track.muted) continue;
      if (anySolo && !track.solo) continue;

      const prepared = np.gateOn
        ? gateAudioBuffer(track.buffer, fx.noise ?? 0)
        : track.buffer;
      const src = offline.createBufferSource();
      src.buffer =
        room?.profile && roomAmt > 0.02
          ? subtractRoomFromBuffer(prepared, room.profile, roomAmt)
          : prepared;
      src.playbackRate.value = rate;

      const g = offline.createGain();
      g.gain.value = track.volume;
      const p = offline.createStereoPanner();
      p.pan.value = track.pan;

      src.connect(g);
      g.connect(p);
      p.connect(bus);
      src.start(track.offset);
    }

    const rendered = await offline.startRendering();
    return audioBufferToWav(rendered);
  }

  dispose() {
    this.pause();
    this.stopLiveFx();
    this.stopPitchTap();
    this.tapNoteOff();
    if (this.mediaRecorder && this.status === "recording") {
      try {
        this.mediaRecorder.stop();
      } catch {
        /* noop */
      }
    }
    this.disconnectMonitorOnly();
    this.releaseInputStreamTracks();
    cancelAnimationFrame(this.raf);
    if (this.levelRaf) cancelAnimationFrame(this.levelRaf);
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}

let singleton: AudioEngine | null = null;

export function getAudioEngine(): AudioEngine {
  if (typeof window === "undefined") {
    throw new Error("AudioEngine is browser-only");
  }
  if (!singleton) singleton = new AudioEngine();
  return singleton;
}
