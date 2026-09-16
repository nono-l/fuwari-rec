/* AudioWorklet: peak limiter with lookahead delay. */
const MAX_LOOK = 2048;

class PeakLimiterProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "ceiling", defaultValue: 0.676, minValue: 0.001, maxValue: 1, automationRate: "k-rate" },
      { name: "lookahead", defaultValue: 2, minValue: 0, maxValue: 15, automationRate: "k-rate" },
      { name: "release", defaultValue: 60, minValue: 5, maxValue: 500, automationRate: "k-rate" },
      { name: "makeup", defaultValue: 1, minValue: 1, maxValue: 16, automationRate: "k-rate" },
      { name: "mix", defaultValue: 1, minValue: 0, maxValue: 1, automationRate: "k-rate" },
    ];
  }

  constructor() {
    super();
    this.bufL = new Float32Array(MAX_LOOK);
    this.bufR = new Float32Array(MAX_LOOK);
    this.w = 0;
    this.gr = 1;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || !output[0]) return true;

    const inL = input && input[0] ? input[0] : null;
    const inR = input && input[1] ? input[1] : inL;
    const outL = output[0];
    const outR = output[1] || output[0];
    const n = outL.length;

    const ceiling = parameters.ceiling.length ? parameters.ceiling[0] : 0.676;
    const lookMs = parameters.lookahead.length ? parameters.lookahead[0] : 2;
    const relMs = parameters.release.length ? parameters.release[0] : 60;
    const makeup = parameters.makeup.length ? parameters.makeup[0] : 1;
    const mix = parameters.mix.length ? parameters.mix[0] : 1;
    const look = Math.max(
      0,
      Math.min(MAX_LOOK - 1, Math.round((lookMs * sampleRate) / 1000)),
    );
    const rel = 1 - Math.exp(-1 / (sampleRate * Math.max(0.005, relMs / 1000)));
    const ceil = Math.max(0.001, ceiling);
    const dry = 1 - mix;

    for (let i = 0; i < n; i++) {
      const xL = inL ? inL[i] : 0;
      const xR = inR ? inR[i] : xL;
      const peak = Math.max(Math.abs(xL), Math.abs(xR));
      const needed = peak > ceil ? ceil / peak : 1;
      if (needed < this.gr) this.gr = needed;
      else this.gr += (1 - this.gr) * rel;

      this.bufL[this.w] = xL;
      this.bufR[this.w] = xR;
      const r = (this.w - look + MAX_LOOK) % MAX_LOOK;
      this.w = (this.w + 1) % MAX_LOOK;

      const dL = this.bufL[r];
      const dR = this.bufR[r];
      const g = this.gr * makeup;
      let yL = dL * dry + dL * g * mix;
      let yR = dR * dry + dR * g * mix;
      if (yL > 1) yL = 1;
      else if (yL < -1) yL = -1;
      if (yR > 1) yR = 1;
      else if (yR < -1) yR = -1;
      outL[i] = yL;
      if (outR !== outL) outR[i] = yR;
    }
    return true;
  }
}

registerProcessor("peak-limiter", PeakLimiterProcessor);
