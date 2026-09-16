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
      { name: "uThresh", defaultValue: 0.18, minValue: 0.0001, maxValue: 1, automationRate: "k-rate" },
      { name: "uRatio", defaultValue: 1, minValue: 1, maxValue: 8, automationRate: "k-rate" },
      { name: "uAtk", defaultValue: 8, minValue: 0.5, maxValue: 80, automationRate: "k-rate" },
      { name: "uRel", defaultValue: 100, minValue: 10, maxValue: 800, automationRate: "k-rate" },
      { name: "uMix", defaultValue: 1, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "eThresh", defaultValue: 0.01, minValue: 0.0001, maxValue: 1, automationRate: "k-rate" },
      { name: "eRatio", defaultValue: 1, minValue: 1, maxValue: 8, automationRate: "k-rate" },
      { name: "eAtk", defaultValue: 5, minValue: 0.5, maxValue: 80, automationRate: "k-rate" },
      { name: "eRel", defaultValue: 80, minValue: 10, maxValue: 800, automationRate: "k-rate" },
      { name: "eMix", defaultValue: 1, minValue: 0, maxValue: 1, automationRate: "k-rate" },
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
    const p0 = (name, d) => {
      const arr = parameters[name];
      return arr && arr.length ? arr[0] : d;
    };

    const gateAmt = p0("gate", 0);
    const upAmt = p0("upward", 0);
    const expAmt = p0("expander", 0);
    const gThreshP = p0("gThresh", 0);
    const gAtkMs = p0("gAtk", 5);
    const gHoldMs = p0("gHold", 0);
    const gRelMs = p0("gRel", 60);
    const gFloorP = p0("gFloor", 1);
    const gMixP = p0("gMix", 1);
    const uThreshP = p0("uThresh", 0.18);
    const uRatioP = p0("uRatio", 1);
    const uAtkMs = p0("uAtk", 8);
    const uRelMs = p0("uRel", 100);
    const uMixP = p0("uMix", 1);
    const eThreshP = p0("eThresh", 0.01);
    const eRatioP = p0("eRatio", 1);
    const eAtkMs = p0("eAtk", 5);
    const eRelMs = p0("eRel", 80);
    const eMixP = p0("eMix", 1);

    const dedicated = gThreshP > 1e-5;
    const gateOn = dedicated || gateAmt > 0.02;
    const upDed = uRatioP > 1.02;
    const expDed = eRatioP > 1.02;
    const upOn = upDed || upAmt > 0.02;
    const expOn = expDed || expAmt > 0.02;

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
    } else if (upDed) {
      gateThresh = 0;
      gateFloor = 1;
      atkMs = uAtkMs;
      relMs = uRelMs;
      holdMs = 0;
      mix = uMixP;
    } else if (expDed) {
      gateThresh = 0;
      gateFloor = 1;
      atkMs = eAtkMs;
      relMs = eRelMs;
      holdMs = 0;
      mix = eMixP;
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
    const upThresh = upDed ? uThreshP : 0.18;
    const expThresh = expDed ? eThreshP : 0.05 + expAmt * 0.04;
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
      if (expOn && this.env < expThresh) {
        const x = Math.max(1e-4, this.env / expThresh);
        const exp = expDed ? eRatioP - 1 : expAmt * 1.4;
        target *= Math.pow(x, exp);
      }
      if (upOn && this.env < upThresh) {
        if (upDed) {
          const x = Math.max(1e-4, this.env / upThresh);
          target *= Math.pow(x, 1 / uRatioP - 1);
        } else {
          const lack = (upThresh - this.env) / upThresh;
          target *= 1 + upAmt * lack * 1.6;
        }
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
