/* AI voice: built-in formant STFT always colors the wet path.
 * ONNX hops replace it when conversion actually returns audio. */
const HOP_ONNX = 4096;
const RING = 65536;
const MASK = RING - 1;
const FFT = 512;
const HOP = 128;
const WIN = FFT;

function makeHann(n) {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / n));
  return w;
}

function fft(re, im, inv) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i];
      re[i] = re[j];
      re[j] = t;
      t = im[i];
      im[i] = im[j];
      im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inv ? 2 : -2) * Math.PI) / len;
    const wr0 = Math.cos(ang);
    const wi0 = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wr = 1;
      let wi = 0;
      const h = len >> 1;
      for (let j = 0; j < h; j++) {
        const ur = re[i + j];
        const ui = im[i + j];
        const vr = re[i + j + h] * wr - im[i + j + h] * wi;
        const vi = re[i + j + h] * wi + im[i + j + h] * wr;
        re[i + j] = ur + vr;
        im[i + j] = ui + vi;
        re[i + j + h] = ur - vr;
        im[i + j + h] = ui - vi;
        const nwr = wr * wr0 - wi * wi0;
        wi = wr * wi0 + wi * wr0;
        wr = nwr;
      }
    }
  }
  if (inv) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}

class AiConvertProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.inBuf = new Float32Array(RING);
    this.outBuf = new Float32Array(RING);
    this.iw = 0;
    this.ow = 0;
    this.or = 0;
    this.filledIn = 0;
    this.filledOut = 0;
    this.useOnnx = false;
    this.pending = false;
    this.pendingFrames = 0;
    this.formant = 1.22;
    this.win = makeHann(WIN);
    this.fifo = new Float32Array(FFT);
    this.fifoN = 0;
    this.ola = new Float32Array(FFT * 2);
    this.re = new Float32Array(FFT);
    this.im = new Float32Array(FFT);
    this.mag = new Float32Array(FFT);
    this.formOut = new Float32Array(RING);
    this.fw = 0;
    this.fr = 0;
    this.formFilled = 0;
    this.port.onmessage = (ev) => {
      const msg = ev.data || {};
      if (msg.type === "bypass") {
        this.useOnnx = !msg.value;
        return;
      }
      if (msg.type === "onnx") {
        this.useOnnx = !!msg.value;
        return;
      }
      if (msg.type === "formant") {
        const v = Number(msg.value);
        this.formant = Number.isFinite(v) ? Math.max(0.7, Math.min(1.6, v)) : 1.22;
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

  formantHop(frame) {
    const re = this.re;
    const im = this.im;
    const mag = this.mag;
    const win = this.win;
    const ratio = this.formant;
    for (let i = 0; i < FFT; i++) {
      re[i] = frame[i] * win[i];
      im[i] = 0;
    }
    fft(re, im, false);
    for (let i = 0; i < FFT; i++) mag[i] = Math.hypot(re[i], im[i]);
    for (let i = 0; i < FFT; i++) {
      const src = i / ratio;
      const i0 = Math.max(0, Math.min(FFT - 2, src | 0));
      const f = src - i0;
      const m = mag[i0] * (1 - f) + mag[i0 + 1] * f;
      const ph = Math.atan2(im[i], re[i]);
      re[i] = m * Math.cos(ph);
      im[i] = m * Math.sin(ph);
    }
    fft(re, im, true);
    const ola = this.ola;
    for (let i = 0; i < FFT; i++) ola[i] += re[i] * win[i];
    for (let i = 0; i < HOP; i++) {
      this.formOut[this.fw] = ola[i] * 0.5;
      this.fw = (this.fw + 1) & MASK;
      ola[i] = ola[i + HOP];
    }
    for (let i = FFT - HOP; i < FFT; i++) ola[i] = 0;
    this.formFilled = Math.min(RING, this.formFilled + HOP);
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || !output[0]) return true;
    const dest = output[0];
    const n = dest.length;
    const left = input && input[0] ? input[0] : null;
    const right = input && input[1] ? input[1] : null;

    if (left) {
      for (let i = 0; i < n; i++) {
        const s = right ? (left[i] + right[i]) * 0.5 : left[i];
        this.inBuf[this.iw] = s;
        this.iw = (this.iw + 1) & MASK;
        this.filledIn = Math.min(RING, this.filledIn + 1);
        this.fifo[this.fifoN++] = s;
        if (this.fifoN >= FFT) {
          this.formantHop(this.fifo);
          this.fifo.copyWithin(0, HOP);
          this.fifoN = FFT - HOP;
        }
      }
    }

    if (this.formFilled >= n) {
      let r = this.fr;
      for (let i = 0; i < n; i++) {
        dest[i] = this.formOut[r];
        r = (r + 1) & MASK;
      }
      this.fr = r;
      this.formFilled -= n;
    } else {
      dest.fill(0);
    }

    if (this.useOnnx) {
      if (this.pending) this.pendingFrames += n;
      if (this.pending && this.pendingFrames > sampleRate) {
        this.pending = false;
        this.pendingFrames = 0;
      }
      if (!this.pending && this.filledIn >= HOP_ONNX) {
        const block = new Float32Array(HOP_ONNX);
        let r = (this.iw - this.filledIn + RING) & MASK;
        for (let i = 0; i < HOP_ONNX; i++) {
          block[i] = this.inBuf[r];
          r = (r + 1) & MASK;
        }
        this.filledIn -= HOP_ONNX;
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
      }
    }

    for (let c = 1; c < output.length; c++) output[c].set(dest);
    return true;
  }
}

registerProcessor("ai-convert", AiConvertProcessor);
