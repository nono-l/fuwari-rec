/**
 * Lightweight Standard MIDI File (SMF) parser + soft-synth renderer.
 * No external deps — runs fully in the browser.
 */

import { startMidiVoice, type MidiInstrumentId } from "./midi-instruments";

export interface MidiNote {
  id?: string;
  midi: number;
  start: number;
  duration: number;
  velocity: number; // 0–1
  channel: number;
  /** Original audio slice when this note is a vocal pitch bar. */
  sourceStart?: number;
  sourceDuration?: number;
  sourceMidi?: number;
}

export interface MidiFileTrack {
  index: number;
  name: string | null;
  channel: number | null;
  program: number | null;
  notes: MidiNote[];
  duration: number;
}

export interface ParsedMidi {
  notes: MidiNote[];
  duration: number;
  ticksPerQuarter: number;
  name: string | null;
  format: number;
  tracks: MidiFileTrack[];
}

function readU16(v: DataView, o: number) {
  return v.getUint16(o, false);
}
function readU32(v: DataView, o: number) {
  return v.getUint32(o, false);
}

function readVarLen(data: Uint8Array, offset: number): [number, number] {
  let value = 0;
  let o = offset;
  while (o < data.length) {
    const b = data[o++]!;
    value = (value << 7) | (b & 0x7f);
    if ((b & 0x80) === 0) break;
  }
  return [value, o];
}

/**
 * Parse SMF (format 0 / 1). Returns notes in seconds.
 */
export function parseMidi(buffer: ArrayBuffer): ParsedMidi {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  if (bytes.length < 14) throw new Error("MIDI ファイルが短すぎます");
  const header = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
  if (header !== "MThd") throw new Error("有効な MIDI ファイルではありません");

  const headerLen = readU32(view, 4);
  const format = readU16(view, 8);
  const nTracks = readU16(view, 10);
  const division = readU16(view, 12);

  if (division & 0x8000) {
    throw new Error("SMPTE タイムベースの MIDI は未対応です");
  }
  const ticksPerQuarter = division || 480;

  let offset = 8 + headerLen;
  type RawEv = { tick: number; type: string; data: number[] };
  type RawTrack = { name: string | null; events: RawEv[] };
  const rawTracks: RawTrack[] = [];
  let sequenceName: string | null = null;

  for (let t = 0; t < nTracks; t++) {
    if (offset + 8 > bytes.length) break;
    const id = String.fromCharCode(
      bytes[offset]!,
      bytes[offset + 1]!,
      bytes[offset + 2]!,
      bytes[offset + 3]!,
    );
    if (id !== "MTrk") break;
    const trackLen = readU32(view, offset + 4);
    const start = offset + 8;
    const end = start + trackLen;
    offset = end;

    const events: RawEv[] = [];
    let tick = 0;
    let i = start;
    let running = 0;
    let trackName: string | null = null;

    while (i < end) {
      const [delta, afterDelta] = readVarLen(bytes, i);
      i = afterDelta;
      tick += delta;
      if (i >= end) break;

      let status = bytes[i]!;
      if (status < 0x80) {
        if (!running) break;
        status = running;
      } else {
        i++;
        if (status < 0xf0) running = status;
      }

      if (status === 0xff) {
        const meta = bytes[i++]!;
        const [len, afterLen] = readVarLen(bytes, i);
        i = afterLen;
        const data = Array.from(bytes.subarray(i, i + len));
        i += len;
        if (meta === 0x51 && data.length >= 3) {
          const us =
            ((data[0]! << 16) | (data[1]! << 8) | data[2]!) >>> 0;
          events.push({ tick, type: "tempo", data: [us] });
        } else if (
          (meta === 0x03 || meta === 0x04 || meta === 0x01) &&
          data.length
        ) {
          try {
            const text =
              new TextDecoder().decode(Uint8Array.from(data)).trim() || null;
            if (text) {
              if (!trackName) trackName = text;
              if (!sequenceName) sequenceName = text;
            }
          } catch {
            /* ignore */
          }
        } else if (meta === 0x2f) {
          break;
        }
      } else if (status === 0xf0 || status === 0xf7) {
        const [len, afterLen] = readVarLen(bytes, i);
        i = afterLen + len;
      } else {
        const cmd = status & 0xf0;
        const ch = status & 0x0f;
        let data1 = 0;
        let data2 = 0;
        if (cmd === 0xc0 || cmd === 0xd0) {
          data1 = bytes[i++]!;
        } else {
          data1 = bytes[i++]!;
          data2 = bytes[i++]!;
        }
        if (cmd === 0x90 || cmd === 0x80) {
          events.push({
            tick,
            type: cmd === 0x90 && data2 > 0 ? "on" : "off",
            data: [ch, data1, data2],
          });
        } else if (cmd === 0xc0) {
          events.push({ tick, type: "program", data: [ch, data1] });
        }
      }
    }
    rawTracks.push({ name: trackName, events });
  }

  type TempoEv = { tick: number; us: number };
  const tempos: TempoEv[] = [{ tick: 0, us: 500_000 }];
  for (const tr of rawTracks) {
    for (const e of tr.events) {
      if (e.type === "tempo") tempos.push({ tick: e.tick, us: e.data[0]! });
    }
  }
  tempos.sort((a, b) => a.tick - b.tick);

  const tickToSec = (tick: number): number => {
    let sec = 0;
    let prevTick = 0;
    let us = tempos[0]!.us;
    for (const t of tempos) {
      if (t.tick >= tick) break;
      const dt = t.tick - prevTick;
      sec += (dt * us) / ticksPerQuarter / 1_000_000;
      prevTick = t.tick;
      us = t.us;
    }
    sec += ((tick - prevTick) * us) / ticksPerQuarter / 1_000_000;
    return sec;
  };

  const tracks: MidiFileTrack[] = rawTracks.map((tr, index) => {
    type Active = { startTick: number; vel: number };
    const active = new Map<string, Active>();
    const notes: MidiNote[] = [];
    let program: number | null = null;
    for (const e of tr.events) {
      if (e.type === "program" && program == null) {
        program = e.data[1] ?? null;
        continue;
      }
      if (e.type !== "on" && e.type !== "off") continue;
      const ch = e.data[0]!;
      const note = e.data[1]!;
      const vel = e.data[2]!;
      const key = `${ch}:${note}`;
      if (e.type === "on") {
        active.set(key, { startTick: e.tick, vel });
      } else {
        const a = active.get(key);
        if (!a) continue;
        active.delete(key);
        const start = tickToSec(a.startTick);
        const end = tickToSec(e.tick);
        notes.push({
          midi: note,
          start,
          duration: Math.max(0.03, end - start),
          velocity: Math.min(1, Math.max(0.05, a.vel / 127)),
          channel: ch,
        });
      }
    }
    for (const [key, a] of active) {
      const [ch, note] = key.split(":").map(Number);
      notes.push({
        midi: note!,
        start: tickToSec(a.startTick),
        duration: 0.5,
        velocity: Math.min(1, Math.max(0.05, a.vel / 127)),
        channel: ch!,
      });
    }
    notes.sort((a, b) => a.start - b.start || a.midi - b.midi);
    const counts = new Map<number, number>();
    for (const n of notes) counts.set(n.channel, (counts.get(n.channel) ?? 0) + 1);
    let channel: number | null = null;
    let best = 0;
    for (const [ch, n] of counts) {
      if (n > best) {
        best = n;
        channel = ch;
      }
    }
    const duration = notes.reduce((m, n) => Math.max(m, n.start + n.duration), 0);
    return {
      index,
      name: tr.name,
      channel,
      program,
      notes,
      duration,
    };
  });

  const notes = tracks.flatMap((t) => t.notes);
  notes.sort((a, b) => a.start - b.start);
  let duration = 0;
  for (const n of notes) duration = Math.max(duration, n.start + n.duration);

  return {
    notes,
    duration: duration + 0.15,
    ticksPerQuarter,
    name: sequenceName,
    format,
    tracks,
  };
}

/** Non-empty SMF tracks, or channel splits when a Type 0 file packed several parts into one track. */
export function midiPartsFromParsed(parsed: ParsedMidi): MidiFileTrack[] {
  const withNotes = parsed.tracks.filter((t) => t.notes.length > 0);
  if (withNotes.length === 0) return [];
  if (withNotes.length > 1) return withNotes;
  const only = withNotes[0]!;
  const chans: number[] = [];
  for (const n of only.notes) {
    if (!chans.includes(n.channel)) chans.push(n.channel);
  }
  if (chans.length < 2) return withNotes;
  return chans.map((ch, i) => {
    const notes = only.notes.filter((n) => n.channel === ch);
    const duration = notes.reduce((m, n) => Math.max(m, n.start + n.duration), 0);
    return {
      index: i,
      name:
        ch === 9
          ? "ドラム"
          : only.name
            ? `${only.name} · Ch${ch + 1}`
            : `Ch ${ch + 1}`,
      channel: ch,
      program: only.program,
      notes,
      duration,
    };
  });
}

/**
 * Render MIDI notes to an AudioBuffer with a selectable instrument patch.
 */
export async function renderMidiToAudioBuffer(
  parsed: ParsedMidi,
  sampleRate = 44100,
  instrument: MidiInstrumentId = "piano",
): Promise<AudioBuffer> {
  try {
    const { isSoundfontReady, renderMidiWithSoundfont, hydrateSoundfont } =
      await import("@/lib/audio/soundfont/engine");
    await hydrateSoundfont();
    if (isSoundfontReady()) {
      return await renderMidiWithSoundfont(parsed, sampleRate, instrument);
    }
  } catch (e) {
    console.warn("[soundfont] fallback to built-in synth", e);
  }
  const length = Math.max(
    1,
    Math.ceil(Math.min(parsed.duration, 600) * sampleRate),
  );
  const offline = new OfflineAudioContext(2, length, sampleRate);
  const master = offline.createGain();
  master.gain.value = 0.7;
  master.connect(offline.destination);

  const notes = parsed.notes.slice(0, 8000);

  for (const n of notes) {
    if (n.start >= 600) continue;
    startMidiVoice(offline, master, {
      midi: n.midi,
      velocity: n.velocity,
      t0: n.start,
      duration: Math.min(n.duration, 8),
      instrument,
    });
  }

  return offline.startRendering();
}

export function isMidiFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".mid") ||
    name.endsWith(".midi") ||
    file.type === "audio/midi" ||
    file.type === "audio/mid" ||
    file.type === "audio/x-midi"
  );
}
