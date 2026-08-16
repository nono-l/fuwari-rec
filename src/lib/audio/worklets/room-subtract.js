/* AudioWorklet: spectral subtraction against a captured room/TV profile. */
const FFT = 1024;
const HOP = 512;
const BINS = FFT / 2;

function hann(n) {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  return w;
}

function fft(re, im, invert) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((invert ? 2 : -2) * Math.PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wr = 1;
      let wi = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k];
        const ui = im[i + k];
        const vr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
        const vi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
        const nwr = wr * wlenRe - wi * wlenIm;
        wi = wr * wlenIm + wi * wlenRe;
        wr = nwr;
      }
    }
  }
  if (invert) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}

class RoomSubtractProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.win = hann(FFT);
    this.noise = new Float32Array(BINS);
    this.hasNoise = false;
    this.amount = 0;
    this.inBuf = new Float32Array(FFT * 4);
    this.inLen = 0;
    this.outBuf = new Float32Array(FFT * 4);
    this.outLen = 0;
    this.ola = new Float32Array(FFT);
    this.re = new Float32Array(FFT);
    this.im = new Float32Array(FFT);
    this.port.onmessage = (ev) => {
      const msg = ev.data || {};
      if (msg.type === "profile" && msg.bins) {
        const src = msg.bins;
        const n = Math.min(BINS, src.length);
        this.noise.fill(0);
        for (let i = 0; i < n; i++) this.noise[i] = Number(src[i]) || 0;
        this.hasNoise = true;
      }
      if (msg.type === "amount") {
        this.amount = Math.max(0, Math.min(1, Number(msg.value) || 0));
      }
      if (msg.type === "clear") {
        this.hasNoise = false;
        this.noise.fill(0);
      }
    };
  }

  processHop() {
    const re = this.re;
    const im = this.im;
    const win = this.win;
    for (let i = 0; i < FFT; i++) {
      re[i] = this.inBuf[i] * win[i];
      im[i] = 0;
    }
    fft(re, im, false);

    const amt = this.amount;
    if (this.hasNoise && amt > 0.01) {
      const alpha = 1 + amt * 2.2;
      const floor = 0.06 + (1 - amt) * 0.22;
      for (let k = 0; k < BINS; k++) {
        const mag = Math.hypot(re[k], im[k]);
        const phase = Math.atan2(im[k], re[k]);
        const next = Math.max(mag - alpha * this.noise[k], mag * floor);
        const cr = next * Math.cos(phase);
        const ci = next * Math.sin(phase);
        re[k] = cr;
        im[k] = ci;
        if (k > 0) {
          re[FFT - k] = cr;
          im[FFT - k] = -ci;
        }
      }
    }

    fft(re, im, true);
    for (let i = 0; i < FFT; i++) this.ola[i] += re[i] * win[i];

    this.pushOut(this.ola.subarray(0, HOP));
    this.ola.copyWithin(0, HOP);
    this.ola.fill(0, FFT - HOP);
    this.inBuf.copyWithin(0, HOP);
    this.inLen -= HOP;
  }

  pushOut(chunk) {
    if (this.outLen + chunk.length > this.outBuf.length) {
      const bigger = new Float32Array(this.outBuf.length * 2);
      bigger.set(this.outBuf.subarray(0, this.outLen));
      this.outBuf = bigger;
    }
    this.outBuf.set(chunk, this.outLen);
    this.outLen += chunk.length;
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || !output[0]) return true;
    const frames = output[0].length;
    const ch0 = input && input[0] ? input[0] : null;

    if (!ch0 || !this.hasNoise || this.amount < 0.01) {
      for (let c = 0; c < output.length; c++) {
        const src = input && input[c] ? input[c] : ch0;
        if (src) output[c].set(src);
        else output[c].fill(0);
      }
      this.inLen = 0;
      this.outLen = 0;
      this.ola.fill(0);
      return true;
    }

    if (this.inLen + frames > this.inBuf.length) {
      const bigger = new Float32Array(this.inBuf.length * 2);
      bigger.set(this.inBuf.subarray(0, this.inLen));
      this.inBuf = bigger;
    }
    this.inBuf.set(ch0, this.inLen);
    this.inLen += frames;
    while (this.inLen >= FFT) this.processHop();

    const out0 = output[0];
    if (this.outLen >= frames) {
      out0.set(this.outBuf.subarray(0, frames));
      this.outBuf.copyWithin(0, frames);
      this.outLen -= frames;
    } else {
      // warm-up: pass through until OLA has enough
      out0.set(ch0);
    }
    for (let c = 1; c < output.length; c++) output[c].set(out0);
    return true;
  }
}

registerProcessor("room-subtract", RoomSubtractProcessor);
