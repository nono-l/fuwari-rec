/* AudioWorklet: overlap-add grain pitch shifter for live mic. */
const SIZE = 8192;
const MASK = SIZE - 1;
const GRAIN = 1024;

class PitchShiftProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(SIZE);
    this.w = 0;
    this.r = 0;
    this.rate = 1;
    this.filled = 0;
    this.port.onmessage = (ev) => {
      const msg = ev.data || {};
      if (msg.type === "rate") {
        const v = Number(msg.value);
        this.rate = Number.isFinite(v) ? Math.max(0.5, Math.min(2, v)) : 1;
      }
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || !output[0]) return true;
    const src = input && input[0] ? input[0] : null;
    const dest = output[0];
    const n = dest.length;
    const bypass = !src || Math.abs(this.rate - 1) < 0.0008;

    if (bypass) {
      if (src) {
        dest.set(src);
        for (let c = 1; c < output.length; c++) output[c].set(src);
      } else {
        dest.fill(0);
        for (let c = 1; c < output.length; c++) output[c].fill(0);
      }
      return true;
    }

    const buf = this.buf;
    let w = this.w;
    let r = this.r;
    const rate = this.rate;

    for (let i = 0; i < n; i++) {
      buf[w] = src[i];
      w = (w + 1) & MASK;
      this.filled = Math.min(SIZE, this.filled + 1);

      if (this.filled < GRAIN + 4) {
        dest[i] = src[i];
        r += 1;
        continue;
      }

      const r2 = r + GRAIN / 2;
      const i1 = r | 0;
      const i2 = r2 | 0;
      const f1 = r - i1;
      const f2 = r2 - i2;
      const a1 = buf[i1 & MASK];
      const b1 = buf[(i1 + 1) & MASK];
      const a2 = buf[i2 & MASK];
      const b2 = buf[(i2 + 1) & MASK];
      const s1 = a1 + (b1 - a1) * f1;
      const s2 = a2 + (b2 - a2) * f2;
      const ph = (r % GRAIN) / GRAIN;
      const xf = 0.5 - 0.5 * Math.cos(2 * Math.PI * ph);
      dest[i] = s1 * (1 - xf) + s2 * xf;
      r += rate;
      if (r > 1e9) r -= SIZE * 64;
    }

    this.w = w;
    this.r = r;
    for (let c = 1; c < output.length; c++) output[c].set(dest);
    return true;
  }
}

registerProcessor("pitch-shift", PitchShiftProcessor);
