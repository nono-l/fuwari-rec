export const MAX_CABLES = 3;
export const MAX_CABLE_INSERTS = 8;

export type CableIndex = 1 | 2 | 3;
export type CableKind = "out" | "in";
export type CableOutMode = "split" | "send";

export type CableInsert = {
  id: string;
  name: string;
  enabled: boolean;
  kind: CableKind;
  cable: CableIndex;
  /** out: split keeps the chain, send is tap-only (dry muted). */
  mode: CableOutMode;
  /** in: how much of the return to mix (0–1). */
  mix: number;
};

export function asCableIndex(n: unknown): CableIndex {
  const v = Math.round(Number(n));
  if (v === 2) return 2;
  if (v === 3) return 3;
  return 1;
}

export function cableLabel(n: CableIndex) {
  return `仮想ケーブル${n}`;
}

export function newCableInsert(
  kind: CableKind,
  patch?: Partial<CableInsert>,
): CableInsert {
  const cable = asCableIndex(patch?.cable ?? 1);
  const mode: CableOutMode = patch?.mode === "send" ? "send" : "split";
  return {
    id:
      patch?.id ||
      (typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `cab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
    kind,
    cable,
    mode,
    mix: Math.max(0, Math.min(1, Number(patch?.mix) || 1)),
    enabled: patch?.enabled !== false,
    name:
      patch?.name?.trim() ||
      (kind === "out"
        ? `${cableLabel(cable)}へ出力`
        : `${cableLabel(cable)}から入力`),
  };
}

export function cableSummary(c: CableInsert) {
  if (c.kind === "out") {
    return c.mode === "send"
      ? `${cableLabel(c.cable)}へ送り切り`
      : `${cableLabel(c.cable)}へ分岐`;
  }
  return `${cableLabel(c.cable)}から · ${Math.round(c.mix * 100)}%`;
}

export function defaultCableName(c: CableInsert) {
  return c.kind === "out"
    ? `${cableLabel(c.cable)}へ出力`
    : `${cableLabel(c.cable)}から入力`;
}

/** Send = pipelines read here. Return = pipelines write here. P1 in-stages mix return. */
export class CablePatchbay {
  private sends = new Map<number, GainNode>();
  private returns = new Map<number, GainNode>();

  constructor(private ctx: BaseAudioContext) {}

  send(n: CableIndex): GainNode {
    let g = this.sends.get(n);
    if (!g) {
      g = this.ctx.createGain();
      g.gain.value = 1;
      this.sends.set(n, g);
    }
    return g;
  }

  ret(n: CableIndex): GainNode {
    let g = this.returns.get(n);
    if (!g) {
      g = this.ctx.createGain();
      g.gain.value = 1;
      this.returns.set(n, g);
    }
    return g;
  }

  dispose() {
    for (const g of [...this.sends.values(), ...this.returns.values()]) {
      try {
        g.disconnect();
      } catch {
        /* noop */
      }
    }
    this.sends.clear();
    this.returns.clear();
  }
}

export type CableHandle = {
  id: string;
  input: AudioNode;
  output: AudioNode;
  apply: (next: CableInsert) => void;
  dispose: () => void;
};

export function createCableHandle(
  ctx: BaseAudioContext,
  insert: CableInsert,
  bay: CablePatchbay,
): CableHandle {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const dry = ctx.createGain();
  const send = ctx.createGain();
  const retMix = ctx.createGain();
  input.gain.value = 1;
  output.gain.value = 1;

  const wire = (v: CableInsert) => {
    try {
      input.disconnect();
    } catch {
      /* noop */
    }
    try {
      dry.disconnect();
    } catch {
      /* noop */
    }
    try {
      send.disconnect();
    } catch {
      /* noop */
    }
    try {
      retMix.disconnect();
    } catch {
      /* noop */
    }
    if (v.kind === "out") {
      dry.gain.value = v.mode === "send" ? 0 : 1;
      send.gain.value = 1;
      input.connect(dry);
      dry.connect(output);
      input.connect(send);
      send.connect(bay.send(v.cable));
    } else {
      dry.gain.value = 1;
      retMix.gain.value = v.mix;
      input.connect(dry);
      dry.connect(output);
      bay.ret(v.cable).connect(retMix);
      retMix.connect(output);
    }
  };

  wire(insert);

  return {
    id: insert.id,
    input,
    output,
    apply: (next) => {
      if (next.kind !== insert.kind || next.cable !== insert.cable) {
        wire(next);
        return;
      }
      if (next.kind === "out") {
        dry.gain.value = next.mode === "send" ? 0 : 1;
      } else {
        retMix.gain.value = next.mix;
      }
    },
    dispose: () => {
      try {
        input.disconnect();
      } catch {
        /* noop */
      }
      try {
        dry.disconnect();
      } catch {
        /* noop */
      }
      try {
        send.disconnect();
      } catch {
        /* noop */
      }
      try {
        retMix.disconnect();
      } catch {
        /* noop */
      }
    },
  };
}
