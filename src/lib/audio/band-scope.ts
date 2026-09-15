import { clampFilterHz } from "./spectrum-filters";

/** Split: FX hears only the band; the rest bypasses. Full: FX hears everything. */
export function createBandScope(ctx: BaseAudioContext) {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const fxIn = ctx.createGain();
  const fxOut = ctx.createGain();
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  const notch = ctx.createBiquadFilter();
  notch.type = "notch";
  let mode: "full" | "band" | null = null;

  const clear = () => {
    for (const n of [input, bp, notch, fxIn, fxOut]) {
      try {
        n.disconnect();
      } catch {
        /* noop */
      }
    }
  };

  const apply = (fullBand: boolean, hz: number, q: number) => {
    const f = clampFilterHz(hz);
    const qq = Math.max(0.35, Math.min(18, q));
    bp.frequency.value = f;
    bp.Q.value = qq;
    notch.frequency.value = f;
    notch.Q.value = qq;
    const next = fullBand ? "full" : "band";
    if (mode === next) return;
    clear();
    mode = next;
    if (fullBand) {
      input.connect(fxIn);
      fxOut.connect(output);
    } else {
      input.connect(bp);
      bp.connect(fxIn);
      input.connect(notch);
      notch.connect(output);
      fxOut.connect(output);
    }
  };

  const dispose = () => {
    clear();
    try {
      output.disconnect();
    } catch {
      /* noop */
    }
  };

  return { input, output, fxIn, fxOut, apply, dispose };
}
