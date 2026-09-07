import { applyFilterToBiquad, type SpectrumFilter } from "./spectrum-filters";
import {
  createObsInsertHandle,
  type ObsInsert,
} from "./obs-filters";

export type LiveSlot = {
  family: "spectrum" | "obs";
  id: string;
};

export type LiveFxItem =
  | { family: "spectrum"; filter: SpectrumFilter }
  | { family: "obs"; insert: ObsInsert };

export type LiveHandle = {
  id: string;
  input: AudioNode;
  output: AudioNode;
  apply: (next: LiveFxItem) => void;
  dispose: () => void;
};

export function liveItemId(item: LiveFxItem) {
  return item.family === "spectrum" ? item.filter.id : item.insert.id;
}

export function liveItemEnabled(item: LiveFxItem) {
  return item.family === "spectrum" ? item.filter.enabled : item.insert.enabled;
}

export function liveChainKey(items: LiveFxItem[]) {
  return items
    .filter(liveItemEnabled)
    .map((item) =>
      item.family === "spectrum"
        ? `s:${item.filter.id}`
        : `o:${item.insert.id}:${item.insert.kind}`,
    )
    .join(">");
}

export function assembleLiveFx(
  order: LiveSlot[],
  spectrum: SpectrumFilter[],
  obs: ObsInsert[],
): LiveFxItem[] {
  const specs = new Map(spectrum.map((f) => [f.id, f]));
  const inserts = new Map(obs.map((f) => [f.id, f]));
  const used = new Set<string>();
  const out: LiveFxItem[] = [];
  for (const slot of order) {
    if (slot.family === "spectrum") {
      const f = specs.get(slot.id);
      if (!f || used.has(f.id)) continue;
      used.add(f.id);
      out.push({ family: "spectrum", filter: f });
    } else {
      const f = inserts.get(slot.id);
      if (!f || used.has(f.id)) continue;
      used.add(f.id);
      out.push({ family: "obs", insert: f });
    }
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
): LiveSlot[] {
  return assembleLiveFx(order, spectrum, obs).map((item) =>
    item.family === "spectrum"
      ? { family: "spectrum" as const, id: item.filter.id }
      : { family: "obs" as const, id: item.insert.id },
  );
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
  workletFactory?: () => AudioWorkletNode | null,
): LiveHandle {
  if (item.family === "spectrum") {
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
): AudioNode {
  let prev: AudioNode = source;
  for (const item of items) {
    if (!liveItemEnabled(item)) continue;
    const handle = createLiveHandle(ctx, item, workletFactory);
    prev.connect(handle.input);
    prev = handle.output;
  }
  return prev;
}
