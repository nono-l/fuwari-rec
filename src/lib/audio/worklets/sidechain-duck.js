/* AudioWorklet: duck input 0 from the envelope of input 1 (sidechain key). */
class SidechainDuckProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "thresh", defaultValue: 0.025, minValue: 0.0001, maxValue: 1, automationRate: "k-rate" },
      { name: "depth", defaultValue: 0.7, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "atk", defaultValue: 12, minValue: 1, maxValue: 200, automationRate: "k-rate" },
      { name: "rel", defaultValue: 180, minValue: 20, maxValue: 2000, automationRate: "k-rate" },
      { name: "on", defaultValue: 1, minValue: 0, maxValue: 1, automationRate: "k-rate" },
    ];
  }

  constructor() {
    super();
    this.env = 0;
    this.g = 1;
  }

  process(inputs, outputs, parameters) {
    const audio = inputs[0];
    const key = inputs[1];
    const output = outputs[0];
    if (!output || !output.length || !output[0]) return true;
    const frames = output[0].length;
    const p0 = (name, d) => {
      const arr = parameters[name];
      return arr && arr.length ? arr[0] : d;
    };
    const on = p0("on", 1);
    const thresh = Math.max(1e-5, p0("thresh", 0.025));
    const depth = Math.max(0, Math.min(1, p0("depth", 0.7)));
    const atkMs = Math.max(1, p0("atk", 12));
    const relMs = Math.max(20, p0("rel", 180));
    const atkC = Math.exp(-1 / (0.001 * atkMs * sampleRate));
    const relC = Math.exp(-1 / (0.001 * relMs * sampleRate));

    let peak = 0;
    if (key && key.length) {
      for (let c = 0; c < key.length; c++) {
        const ch = key[c];
        if (!ch) continue;
        for (let i = 0; i < frames; i++) {
          const a = ch[i] < 0 ? -ch[i] : ch[i];
          if (a > peak) peak = a;
        }
      }
    }
    if (peak > this.env) this.env = peak + (this.env - peak) * atkC;
    else this.env = peak + (this.env - peak) * relC;

    let target = 1;
    if (on > 0.5) {
      const over = (this.env - thresh) / thresh;
      const amt = over > 0 ? (over > 1 ? 1 : over) * depth : 0;
      target = 1 - amt;
    }
    if (target < this.g) this.g = target + (this.g - target) * atkC;
    else this.g = target + (this.g - target) * relC;
    const g = this.g;

    const chs = output.length;
    for (let c = 0; c < chs; c++) {
      const src = audio && audio[c] ? audio[c] : audio && audio[0] ? audio[0] : null;
      const dst = output[c];
      if (!dst) continue;
      if (!src) {
        dst.fill(0);
        continue;
      }
      for (let i = 0; i < frames; i++) dst[i] = src[i] * g;
    }
    return true;
  }
}

registerProcessor("sidechain-duck", SidechainDuckProcessor);
