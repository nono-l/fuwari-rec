/**
 * Lightweight Standard MIDI File (SMF) parser + soft-synth renderer.
 * No external deps — runs fully in the browser.
 */

export interface MidiNote {
  midi: number;
  start: number;
  duration: number;
  velocity: number; // 0–1
  channel: number;
}

export interface ParsedMidi {
  notes: MidiNote[];
  duration: number;
  ticksPerQuarter: number;
  name: string | null;
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
  const nTracks = readU16(view, 10);
  const division = readU16(view, 12);

  if (division & 0x8000) {
    throw new Error("SMPTE タイムベースの MIDI は未対応です");
  }
  const ticksPerQuarter = division || 480;

  let offset = 8 + headerLen;
  type RawEv = { tick: number; type: string; data: number[] };
  const trackEvents: RawEv[][] = [];
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
          (meta === 0x03 || meta === 0x01) &&
          data.length &&
          !sequenceName
        ) {
          try {
            sequenceName =
              new TextDecoder().decode(Uint8Array.from(data)).trim() || null;
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
        }
      }
    }
    trackEvents.push(events);
  }

  type TempoEv = { tick: number; us: number };
  const tempos: TempoEv[] = [{ tick: 0, us: 500_000 }];
  const noteEvents: {
    tick: number;
    type: "on" | "off";
    ch: number;
    note: number;
    vel: number;
  }[] = [];

  for (const events of trackEvents) {
    for (const e of events) {
      if (e.type === "tempo") {
        tempos.push({ tick: e.tick, us: e.data[0]! });
      } else if (e.type === "on" || e.type === "off") {
        noteEvents.push({
          tick: e.tick,
          type: e.type as "on" | "off",
          ch: e.data[0]!,
          note: e.data[1]!,
          vel: e.data[2]!,
        });
      }
    }
  }
  tempos.sort((a, b) => a.tick - b.tick);
  noteEvents.sort((a, b) => a.tick - b.tick);

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

  type Active = { startTick: number; vel: number };
  const active = new Map<string, Active>();
  const notes: MidiNote[] = [];

  for (const e of noteEvents) {
    const key = `${e.ch}:${e.note}`;
    if (e.type === "on") {
      active.set(key, { startTick: e.tick, vel: e.vel });
    } else {
      const a = active.get(key);
      if (!a) continue;
      active.delete(key);
      const start = tickToSec(a.startTick);
      const end = tickToSec(e.tick);
      const duration = Math.max(0.03, end - start);
      notes.push({
        midi: e.note,
        start,
        duration,
        velocity: Math.min(1, Math.max(0.05, a.vel / 127)),
        channel: e.ch,
      });
    }
  }
  for (const [key, a] of active) {
    const note = Number(key.split(":")[1]);
    const ch = Number(key.split(":")[0]);
    const start = tickToSec(a.startTick);
    notes.push({
      midi: note,
      start,
      duration: 0.5,
      velocity: Math.min(1, Math.max(0.05, a.vel / 127)),
      channel: ch,
    });
  }

  notes.sort((a, b) => a.start - b.start);
  let duration = 0;
  for (const n of notes) {
    duration = Math.max(duration, n.start + n.duration);
  }

  return {
    notes,
    duration: duration + 0.15,
    ticksPerQuarter,
    name: sequenceName,
  };
}

function midiToHz(midi: number) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Render MIDI notes to an AudioBuffer with a soft multi-oscillator synth.
 */
export async function renderMidiToAudioBuffer(
  parsed: ParsedMidi,
  sampleRate = 44100,
): Promise<AudioBuffer> {
  const length = Math.max(
    1,
    Math.ceil(Math.min(parsed.duration, 600) * sampleRate),
  );
  const offline = new OfflineAudioContext(2, length, sampleRate);
  const master = offline.createGain();
  master.gain.value = 0.55;
  master.connect(offline.destination);

  const notes = parsed.notes.slice(0, 8000);

  for (const n of notes) {
    if (n.start >= 600) continue;
    const freq = midiToHz(n.midi);
    const dur = Math.min(n.duration, 8);
    const t0 = n.start;
    const vel = n.velocity;

    const osc1 = offline.createOscillator();
    const osc2 = offline.createOscillator();
    osc1.type = "triangle";
    osc2.type = "sine";
    osc1.frequency.value = freq;
    osc2.frequency.value = freq * 2;
    osc2.detune.value = 4;

    const g = offline.createGain();
    const peak = 0.12 * vel;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(
      peak * 0.55,
      t0 + Math.min(0.12, dur * 0.3),
    );
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    const filt = offline.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 1800 + n.midi * 20;
    filt.Q.value = 0.7;

    osc1.connect(g);
    osc2.connect(g);
    g.connect(filt);
    filt.connect(master);

    osc1.start(t0);
    osc2.start(t0);
    osc1.stop(t0 + dur + 0.05);
    osc2.stop(t0 + dur + 0.05);
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
