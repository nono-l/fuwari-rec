import { applyFilterToBiquad, type SpectrumFilter } from "./spectrum-filters";
import { createBandFxHandle, isBandFxKind } from "./band-fx";
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

export type LiveSlot = {
  family: "spectrum" | "obs" | "ai" | "cable";
  id: string;
};

export type LiveFxItem =
  | { family: "spectrum"; filter: SpectrumFilter }
  | { family: "obs"; insert: ObsInsert }
  | { family: "ai"; voice: AiVoiceInsert }
  | { family: "cable"; cable: CableInsert };

export type LiveHandleOpts = {
  workletFactory?: () => AudioWorkletNode | null;
  cables?: CablePatchbay | null;
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
  return item.cable.id;
}

export function liveItemEnabled(item: LiveFxItem) {
  if (item.family === "spectrum") return item.filter.enabled;
  if (item.family === "obs") return item.insert.enabled;
  if (item.family === "ai") return item.voice.enabled;
  return item.cable.enabled;
}

export function liveChainKey(items: LiveFxItem[]) {
  return items
    .filter(liveItemEnabled)
    .map((item) => {
      if (item.family === "spectrum") {
        return `s:${item.filter.id}:${item.filter.kind}`;
      }
      if (item.family === "obs") {
        return `o:${item.insert.id}:${item.insert.kind}`;
      }
      if (item.family === "ai") {
        return `a:${item.voice.id}:${Math.abs(item.voice.pitch) >= 0.05 ? "p" : "d"}`;
      }
      return `c:${item.cable.id}:${item.cable.kind}:${item.cable.cable}:${item.cable.mode}`;
    })
    .join(">");
}

export function assembleLiveFx(
  order: LiveSlot[],
  spectrum: SpectrumFilter[],
  obs: ObsInsert[],
  ai: AiVoiceInsert | null = null,
  cables: CableInsert[] = [],
): LiveFxItem[] {
  const specs = new Map(spectrum.map((f) => [f.id, f]));
  const inserts = new Map(obs.map((f) => [f.id, f]));
  const cabs = new Map(cables.map((f) => [f.id, f]));
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
    }
  }
  if (ai && !used.has(ai.id)) out.push({ family: "ai", voice: ai });
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
): LiveSlot[] {
  return assembleLiveFx(order, spectrum, obs, ai, cables).map((item) => {
    if (item.family === "spectrum") {
      return { family: "spectrum" as const, id: item.filter.id };
    }
    if (item.family === "obs") {
      return { family: "obs" as const, id: item.insert.id };
    }
    if (item.family === "ai") {
      return { family: "ai" as const, id: item.voice.id };
    }
    return { family: "cable" as const, id: item.cable.id };
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
  const h = createObsInsertHandle(ctx, item.insert, workletFactory);
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

export function connectLiveChain(
  ctx: BaseAudioContext,
  source: AudioNode,
  items: LiveFxItem[],
  workletFactory?: () => AudioWorkletNode | null,
  cables?: CablePatchbay | null,
): AudioNode {
  let prev: AudioNode = source;
  for (const item of items) {
    if (!liveItemEnabled(item)) continue;
    const handle = createLiveHandle(ctx, item, { workletFactory, cables });
    prev.connect(handle.input);
    prev = handle.output;
  }
  return prev;
}
