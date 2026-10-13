/* Tap post-FX audio into PCM chunks. Output is a silent pull, not a monitor. */
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.cap = 4800;
    this.n = 0;
    this.l = new Float32Array(this.cap);
    this.r = new Float32Array(this.cap);
    this.port.onmessage = (e) => {
      if (e.data === "flush") this.flush();
    };
  }

  flush() {
    if (!this.n) return;
    this.port.postMessage({
      l: this.l.slice(0, this.n),
      r: this.r.slice(0, this.n),
    });
    this.n = 0;
  }

  process(inputs, outputs) {
    const ch0 = inputs[0]?.[0];
    const ch1 = inputs[0]?.[1] ?? ch0;
    const out0 = outputs[0]?.[0];
    const out1 = outputs[0]?.[1];
    if (!ch0) return true;
    if (out0) out0.set(ch0);
    if (out1 && ch1) out1.set(ch1);
    for (let i = 0; i < ch0.length; i++) {
      this.l[this.n] = ch0[i];
      this.r[this.n] = ch1 ? ch1[i] : ch0[i];
      this.n += 1;
      if (this.n >= this.cap) this.flush();
    }
    return true;
  }
}

registerProcessor("pcm-capture", PcmCaptureProcessor);
