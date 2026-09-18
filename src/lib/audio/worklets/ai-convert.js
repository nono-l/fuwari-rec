/* AudioWorklet: hop audio to the main thread for ONNX voice conversion. */
const HOP = 4096;
const RING = 16384;
const MASK = RING - 1;

class AiConvertProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.inBuf = new Float32Array(RING);
    this.outBuf = new Float32Array(RING);
    this.iw = 0;
    this.ir = 0;
    this.ow = 0;
    this.or = 0;
    this.filledIn = 0;
    this.filledOut = 0;
    this.bypass = true;
    this.pending = false;
    this.pendingFrames = 0;
    this.last = new Float32Array(128);
    this.port.onmessage = (ev) => {
      const msg = ev.data || {};
      if (msg.type === "bypass") {
        this.bypass = !!msg.value;
        return;
      }
      if (msg.type === "skip") {
        this.pending = false;
        this.pendingFrames = 0;
        return;
      }
      if (msg.type === "out" && msg.samples) {
        const src = msg.samples;
        for (let i = 0; i < src.length; i++) {
          this.outBuf[this.ow] = src[i];
          this.ow = (this.ow + 1) & MASK;
        }
        this.filledOut = Math.min(RING, this.filledOut + src.length);
        this.pending = false;
        this.pendingFrames = 0;
      }
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || !output[0]) return true;
    const dest = output[0];
    const n = dest.length;
    const left = input && input[0] ? input[0] : null;
    const right = input && input[1] ? input[1] : null;

    if (this.bypass || !left) {
      if (left) {
        dest.set(left);
        this.last.set(left.subarray(0, Math.min(this.last.length, n)));
      } else {
        dest.fill(0);
      }
      for (let c = 1; c < output.length; c++) output[c].set(dest);
      return true;
    }

    for (let i = 0; i < n; i++) {
      const s = right ? (left[i] + right[i]) * 0.5 : left[i];
      this.inBuf[this.iw] = s;
      this.iw = (this.iw + 1) & MASK;
      this.filledIn = Math.min(RING, this.filledIn + 1);
    }

    if (this.pending) this.pendingFrames += n;
    if (this.pending && this.pendingFrames > sampleRate) {
      this.pending = false;
      this.pendingFrames = 0;
    }

    if (!this.pending && this.filledIn >= HOP) {
      const block = new Float32Array(HOP);
      let r = (this.iw - this.filledIn + RING) & MASK;
      for (let i = 0; i < HOP; i++) {
        block[i] = this.inBuf[r];
        r = (r + 1) & MASK;
      }
      this.filledIn -= HOP;
      this.pending = true;
      this.pendingFrames = 0;
      this.port.postMessage({ type: "block", sr: sampleRate, samples: block }, [
        block.buffer,
      ]);
    }

    if (this.filledOut >= n) {
      let r = this.or;
      for (let i = 0; i < n; i++) {
        dest[i] = this.outBuf[r];
        r = (r + 1) & MASK;
      }
      this.or = r;
      this.filledOut -= n;
      this.last.set(dest.subarray(0, Math.min(this.last.length, n)));
    } else {
      const hold = this.last[this.last.length - 1] || 0;
      dest.fill(hold * 0.92);
    }
    for (let c = 1; c < output.length; c++) output[c].set(dest);
    return true;
  }
}

registerProcessor("ai-convert", AiConvertProcessor);
