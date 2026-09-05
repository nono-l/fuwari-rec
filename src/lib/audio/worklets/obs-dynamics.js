/* AudioWorklet: noise gate + expander + upward compressor (OBS-style). */
class ObsDynamicsProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "gate", defaultValue: 0, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "upward", defaultValue: 0, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "expander", defaultValue: 0, minValue: 0, maxValue: 1, automationRate: "k-rate" },
    ];
  }

  constructor() {
    super();
    this.env = 0;
    this.g = 1;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !input.length || !input[0] || !output || !output.length) {
      return true;
    }

    const chs = Math.min(input.length, output.length);
    const n = input[0].length;
    const gateAmt = parameters.gate.length ? parameters.gate[0] : 0;
    const upAmt = parameters.upward.length ? parameters.upward[0] : 0;
    const expAmt = parameters.expander.length ? parameters.expander[0] : 0;

    const atk = 1 - Math.exp(-1 / (sampleRate * 0.008));
    const rel = 1 - Math.exp(-1 / (sampleRate * 0.08));
    const gAtk = 1 - Math.exp(-1 / (sampleRate * 0.005));
    const gRel = 1 - Math.exp(-1 / (sampleRate * 0.06));
    const gateThresh = 0.008 + gateAmt * 0.07;
    const gateFloor = Math.max(0.04, 1 - gateAmt * 0.92);
    const upThresh = 0.18;
    const expThresh = 0.05 + expAmt * 0.04;

    for (let i = 0; i < n; i++) {
      let sq = 0;
      for (let c = 0; c < chs; c++) {
        const s = input[c][i];
        sq += s * s;
      }
      const rms = Math.sqrt(sq / Math.max(1, chs));
      this.env += (rms - this.env) * (rms > this.env ? atk : rel);

      let target = 1;
      if (gateAmt > 0.02) target *= this.env > gateThresh ? 1 : gateFloor;
      if (expAmt > 0.02 && this.env < expThresh) {
        const x = Math.max(1e-4, this.env / expThresh);
        target *= Math.pow(x, expAmt * 1.4);
      }
      if (upAmt > 0.02 && this.env < upThresh) {
        const lack = (upThresh - this.env) / upThresh;
        target *= 1 + upAmt * lack * 1.6;
      }
      if (target > 6) target = 6;
      this.g += (target - this.g) * (target > this.g ? gAtk : gRel);

      for (let c = 0; c < chs; c++) {
        output[c][i] = input[c][i] * this.g;
      }
      for (let c = chs; c < output.length; c++) {
        output[c][i] = chs ? output[0][i] : 0;
      }
    }
    return true;
  }
}

registerProcessor("obs-dynamics", ObsDynamicsProcessor);
