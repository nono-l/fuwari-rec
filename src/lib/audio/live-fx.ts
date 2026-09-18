import {
  applyFilterToBiquad,
  clampFilterGain,
  createCutSlopeHandle,
  usesSlope,
  type SpectrumFilter,
} from "./spectrum-filters";
import { createBandFxHandle, isBandFxKind } from "./band-fx";
import { createBandScope } from "./band-scope";
import { createAiVoiceHandle, type AiVoiceInsert } from "./ai-voice";
import {
  createObsInsertHandle,
  type ObsInsert,
} from "./obs-filters";
import {
  createCableHandle,
  type CableInsert,
  type CablePatchbay,
} from "./cables";
import {
  createDeviceIoHandle,
  type DeviceIoBay,
  type DeviceIoInsert,
} from "./device-io";

export type LiveSlot = {
  family: "spectrum" | "obs" | "ai" | "cable" | "device";
  id: string;
};

export type LiveFxItem =
  | { family: "spectrum"; filter: SpectrumFilter }
  | { family: "obs"; insert: ObsInsert }
  | { family: "ai"; voice: AiVoiceInsert }
  | { family: "cable"; cable: CableInsert }
  | { family: "device"; io: DeviceIoInsert };

export type LiveHandleOpts = {
  workletFactory?: () => AudioWorkletNode | null;
  cables?: CablePatchbay | null;
  devices?: DeviceIoBay | null;
};

export type LiveHandle = {
  id: string;
  input: AudioNode;
  output: AudioNode;
  apply: (next: LiveFxItem) => void;
  dispose: () => void;
};

export function liveItemId(item: LiveFxItem) {
  if (item.family === "spectrum") return item.filter.id;
  if (item.family === "obs") return item.insert.id;
  if (item.family === "ai") return item.voice.id;
  if (item.family === "cable") return item.cable.id;
  return item.io.id;
}

export function liveItemEnabled(item: LiveFxItem) {
  if (item.family === "spectrum") return item.filter.enabled;
  if (item.family === "obs") return item.insert.enabled;
  if (item.family === "ai") return item.voice.enabled;
  if (item.family === "cable") return item.cable.enabled;
  return item.io.enabled;
}

export function isProcessFamily(family: LiveFxItem["family"]) {
  return family === "spectrum" || family === "obs" || family === "ai";
}

export type ProcessHold = {
  spectrumFilters: SpectrumFilter[];
  obsInserts: ObsInsert[];
  aiVoice: AiVoiceInsert | null;
};

/** Bypass every process stage except `soloId`. Routing (cables / devices) stays. */
export function applyFxSolo(
  items: LiveFxItem[],
  soloId: string | null | undefined,
): LiveFxItem[] {
  if (!soloId) return items;
  return items.map((item) => {
    if (!isProcessFamily(item.family)) return item;
    const on = liveItemId(item) === soloId;
    if (item.family === "spectrum") {
      return { ...item, filter: { ...item.filter, enabled: on } };
    }
    if (item.family === "obs") {
      return { ...item, insert: { ...item.insert, enabled: on } };
    }
    if (item.family === "ai") {
      return { ...item, voice: { ...item.voice, enabled: on } };
    }
    return item;
  });
}

export function liveChainKey(items: LiveFxItem[]) {
  return items
    .filter(liveItemEnabled)
    .map((item) => {
      if (item.family === "spectrum") {
        return `s:${item.filter.id}:${item.filter.kind}:${item.filter.fullBand ? "f" : "b"}`;
      }
      if (item.family === "obs") {
        return `o:${item.insert.id}:${item.insert.kind}:${item.insert.fullBand === false ? "b" : "f"}`;
      }
      if (item.family === "ai") {
        return `a:${item.voice.id}:${Math.abs(item.voice.pitch) >= 0.05 ? "p" : "d"}:${item.voice.modelName}:${Math.round(item.voice.mix * 20)}:${Math.round((item.voice.formant ?? 1.22) * 20)}`;
      }
      if (item.family === "cable") {
        return `c:${item.cable.id}:${item.cable.kind}:${item.cable.cable}:${item.cable.mode}`;
      }
      return `d:${item.io.id}:${item.io.kind}:${item.io.deviceId}:${item.io.mode}`;
    })
    .join(">");
}

export function assembleLiveFx(
  order: LiveSlot[],
  spectrum: SpectrumFilter[],
  obs: ObsInsert[],
  ai: AiVoiceInsert | null = null,
  cables: CableInsert[] = [],
  devices: DeviceIoInsert[] = [],
): LiveFxItem[] {
  const specs = new Map(spectrum.map((f) => [f.id, f]));
  const inserts = new Map(obs.map((f) => [f.id, f]));
  const cabs = new Map(cables.map((f) => [f.id, f]));
  const dios = new Map(devices.map((f) => [f.id, f]));
  const used = new Set<string>();
  const out: LiveFxItem[] = [];
  for (const slot of order) {
    if (slot.family === "spectrum") {
      const f = specs.get(slot.id);
      if (!f || used.has(f.id)) continue;
      used.add(f.id);
      out.push({ family: "spectrum", filter: f });
    } else if (slot.family === "obs") {
      const f = inserts.get(slot.id);
      if (!f || used.has(f.id)) continue;
      used.add(f.id);
      out.push({ family: "obs", insert: f });
    } else if (slot.family === "ai") {
      if (!ai || ai.id !== slot.id || used.has(ai.id)) continue;
      used.add(ai.id);
      out.push({ family: "ai", voice: ai });
    } else if (slot.family === "cable") {
      const f = cabs.get(slot.id);
      if (!f || used.has(f.id)) continue;
      used.add(f.id);
      out.push({ family: "cable", cable: f });
    } else if (slot.family === "device") {
      const f = dios.get(slot.id);
      if (!f || used.has(f.id)) continue;
      used.add(f.id);
      out.push({ family: "device", io: f });
    }
  }
  if (ai && !used.has(ai.id)) out.push({ family: "ai", voice: ai });
  for (const f of devices) {
    if (!used.has(f.id)) out.push({ family: "device", io: f });
  }
  for (const f of cables) {
    if (!used.has(f.id)) out.push({ family: "cable", cable: f });
  }
  for (const f of obs) {
    if (!used.has(f.id)) out.push({ family: "obs", insert: f });
  }
  for (const f of spectrum) {
    if (!used.has(f.id)) out.push({ family: "spectrum", filter: f });
  }
  return out;
}

export function reconcileLiveChain(
  order: LiveSlot[],
  spectrum: SpectrumFilter[],
  obs: ObsInsert[],
  ai: AiVoiceInsert | null = null,
  cables: CableInsert[] = [],
  devices: DeviceIoInsert[] = [],
): LiveSlot[] {
  return assembleLiveFx(order, spectrum, obs, ai, cables, devices).map((item) => {
    if (item.family === "spectrum") {
      return { family: "spectrum" as const, id: item.filter.id };
    }
    if (item.family === "obs") {
      return { family: "obs" as const, id: item.insert.id };
    }
    if (item.family === "ai") {
      return { family: "ai" as const, id: item.voice.id };
    }
    if (item.family === "cable") {
      return { family: "cable" as const, id: item.cable.id };
    }
    return { family: "device" as const, id: item.io.id };
  });
}

export function shiftLiveSlot(
  order: LiveSlot[],
  id: string,
  delta: -1 | 1,
): LiveSlot[] {
  const i = order.findIndex((s) => s.id === id);
  if (i < 0) return order;
  const j = i + delta;
  if (j < 0 || j >= order.length) return order;
  const next = order.slice();
  const [item] = next.splice(i, 1);
  if (!item) return order;
  next.splice(j, 0, item);
  return next;
}

export function createLiveHandle(
  ctx: BaseAudioContext,
  item: LiveFxItem,
  opts?: LiveHandleOpts | (() => AudioWorkletNode | null),
): LiveHandle {
  const workletFactory =
    typeof opts === "function" ? opts : opts?.workletFactory;
  const bay = typeof opts === "function" ? null : opts?.cables;
  const devices = typeof opts === "function" ? null : opts?.devices;
  if (item.family === "spectrum") {
    if (isBandFxKind(item.filter.kind)) {
      const h = createBandFxHandle(ctx, item.filter);
      return {
        id: item.filter.id,
        input: h.input,
        output: h.output,
        apply: (next) => {
          if (next.family === "spectrum") h.apply(next.filter);
        },
        dispose: h.dispose,
      };
    }
    if (item.filter.kind === "peak" && item.filter.fullBand) {
      const g = ctx.createGain();
      const applyPeak = (f: SpectrumFilter) => {
        const db = clampFilterGain(f.gain ?? 0);
        g.gain.value = Math.pow(10, db / 20);
      };
      applyPeak(item.filter);
      return {
        id: item.filter.id,
        input: g,
        output: g,
        apply: (next) => {
          if (next.family === "spectrum") applyPeak(next.filter);
        },
        dispose: () => {
          try {
            g.disconnect();
          } catch {
            /* noop */
          }
        },
      };
    }
    if (usesSlope(item.filter.kind)) {
      const h = createCutSlopeHandle(ctx, item.filter);
      return {
        id: item.filter.id,
        input: h.input,
        output: h.output,
        apply: (next) => {
          if (next.family === "spectrum") h.apply(next.filter);
        },
        dispose: h.dispose,
      };
    }
    const bq = ctx.createBiquadFilter();
    applyFilterToBiquad(bq, item.filter);
    return {
      id: item.filter.id,
      input: bq,
      output: bq,
      apply: (next) => {
        if (next.family === "spectrum") applyFilterToBiquad(bq, next.filter);
      },
      dispose: () => {
        try {
          bq.disconnect();
        } catch {
          /* noop */
        }
      },
    };
  }
  if (item.family === "ai") {
    const h = createAiVoiceHandle(ctx, item.voice);
    return {
      id: item.voice.id,
      input: h.input,
      output: h.output,
      apply: (next) => {
        if (next.family === "ai") h.apply(next.voice);
      },
      dispose: h.dispose,
    };
  }
  if (item.family === "cable") {
    if (!bay) {
      const g = ctx.createGain();
      return {
        id: item.cable.id,
        input: g,
        output: g,
        apply: () => {},
        dispose: () => {
          try {
            g.disconnect();
          } catch {
            /* noop */
          }
        },
      };
    }
    const h = createCableHandle(ctx, item.cable, bay);
    return {
      id: item.cable.id,
      input: h.input,
      output: h.output,
      apply: (next) => {
        if (next.family === "cable") h.apply(next.cable);
      },
      dispose: h.dispose,
    };
  }
  if (item.family === "device") {
    const h = createDeviceIoHandle(ctx, item.io, devices ?? null);
    return {
      id: item.io.id,
      input: h.input,
      output: h.output,
      apply: (next) => {
        if (next.family === "device") h.apply(next.io);
      },
      dispose: h.dispose,
    };
  }
  const h = createObsInsertHandle(ctx, item.insert, workletFactory);
  if (item.insert.fullBand !== false) {
    return {
      id: h.id,
      input: h.input,
      output: h.output,
      apply: (next) => {
        if (next.family === "obs") h.apply(next.insert);
      },
      dispose: h.dispose,
    };
  }
  const scope = createBandScope(ctx);
  scope.fxIn.connect(h.input);
  h.output.connect(scope.fxOut);
  scope.apply(false, item.insert.hz, item.insert.q);
  return {
    id: h.id,
    input: scope.input,
    output: scope.output,
    apply: (next) => {
      if (next.family !== "obs") return;
      h.apply(next.insert);
      scope.apply(
        next.insert.fullBand !== false,
        next.insert.hz,
        next.insert.q,
      );
    },
    dispose: () => {
      h.dispose();
      scope.dispose();
    },
  };
}

export function connectLiveChain(
  ctx: BaseAudioContext,
  source: AudioNode,
  items: LiveFxItem[],
  workletFactory?: () => AudioWorkletNode | null,
  cables?: CablePatchbay | null,
  devices?: DeviceIoBay | null,
): AudioNode {
  let prev: AudioNode = source;
  for (const item of items) {
    if (!liveItemEnabled(item)) continue;
    const handle = createLiveHandle(ctx, item, {
      workletFactory,
      cables,
      devices,
    });
    prev.connect(handle.input);
    prev = handle.output;
  }
  return prev;
}
