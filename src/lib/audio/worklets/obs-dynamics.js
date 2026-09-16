/* AudioWorklet: noise gate + expander + upward compressor (OBS-style). */
class ObsDynamicsProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "gate", defaultValue: 0, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "upward", defaultValue: 0, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "expander", defaultValue: 0, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "gThresh", defaultValue: 0, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "gAtk", defaultValue: 5, minValue: 0.5, maxValue: 40, automationRate: "k-rate" },
      { name: "gHold", defaultValue: 0, minValue: 0, maxValue: 400, automationRate: "k-rate" },
      { name: "gRel", defaultValue: 60, minValue: 5, maxValue: 800, automationRate: "k-rate" },
      { name: "gFloor", defaultValue: 1, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "gMix", defaultValue: 1, minValue: 0, maxValue: 1, automationRate: "k-rate" },
    ];
  }

  constructor() {
    super();
    this.env = 0;
    this.g = 1;
    this.holdLeft = 0;
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
    const gThreshP = parameters.gThresh.length ? parameters.gThresh[0] : 0;
    const gAtkMs = parameters.gAtk.length ? parameters.gAtk[0] : 5;
    const gHoldMs = parameters.gHold.length ? parameters.gHold[0] : 0;
    const gRelMs = parameters.gRel.length ? parameters.gRel[0] : 60;
    const gFloorP = parameters.gFloor.length ? parameters.gFloor[0] : 1;
    const gMixP = parameters.gMix.length ? parameters.gMix[0] : 1;

    const dedicated = gThreshP > 1e-5;
    const gateOn = dedicated || gateAmt > 0.02;
    let gateThresh;
    let gateFloor;
    let atkMs;
    let relMs;
    let holdMs;
    let mix;
    if (dedicated) {
      gateThresh = gThreshP;
      gateFloor = gFloorP;
      atkMs = gAtkMs;
      relMs = gRelMs;
      holdMs = gHoldMs;
      mix = gMixP;
    } else {
      gateThresh = 0.008 + gateAmt * 0.07;
      gateFloor = Math.max(0.04, 1 - gateAmt * 0.92);
      atkMs = 5;
      relMs = 60;
      holdMs = 0;
      mix = 1;
    }

    const detAtk = 1 - Math.exp(-1 / (sampleRate * 0.008));
    const detRel = 1 - Math.exp(-1 / (sampleRate * 0.08));
    const gAtk = 1 - Math.exp(-1 / (sampleRate * Math.max(0.0005, atkMs / 1000)));
    const gRel = 1 - Math.exp(-1 / (sampleRate * Math.max(0.005, relMs / 1000)));
    const holdN = Math.max(0, Math.round((holdMs * sampleRate) / 1000));
    const upThresh = 0.18;
    const expThresh = 0.05 + expAmt * 0.04;
    const dry = 1 - mix;

    for (let i = 0; i < n; i++) {
      let sq = 0;
      for (let c = 0; c < chs; c++) {
        const s = input[c][i];
        sq += s * s;
      }
      const rms = Math.sqrt(sq / Math.max(1, chs));
      this.env += (rms - this.env) * (rms > this.env ? detAtk : detRel);

      let target = 1;
      if (gateOn) {
        if (this.env > gateThresh) {
          this.holdLeft = holdN;
          target *= 1;
        } else if (this.holdLeft > 0) {
          this.holdLeft -= 1;
          target *= 1;
        } else {
          target *= gateFloor;
        }
      }
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
        const x = input[c][i];
        output[c][i] = x * dry + x * this.g * mix;
      }
      for (let c = chs; c < output.length; c++) {
        output[c][i] = chs ? output[0][i] : 0;
      }
    }
    return true;
  }
}

registerProcessor("obs-dynamics", ObsDynamicsProcessor);
