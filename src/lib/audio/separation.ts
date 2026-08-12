export type SeparationMode = "remove-vocals" | "remove-instrumental";

/**
 * Classic stereo mid/side separation (karaoke-style).
 * - remove-vocals: keep side (L−R) — often attenuates centered lead vocals
 * - remove-instrumental: keep mid ((L+R)/2) — often isolates centered lead
 *
 * Not ML isolation. Works best on true stereo commercial mixes.
 * Mono sources cannot be center-cancelled meaningfully.
 */
export function processSeparation(
  source: AudioBuffer,
  mode: SeparationMode,
  ctx: BaseAudioContext,
): AudioBuffer {
  const length = source.length;
  const rate = source.sampleRate;
  const out = ctx.createBuffer(2, length, rate);
  const oL = out.getChannelData(0);
  const oR = out.getChannelData(1);

  if (source.numberOfChannels < 2) {
    throw new Error(
      "ステレオ音源が必要です。モノラルではセンター分離できません。",
    );
  }

  const L = source.getChannelData(0);
  const R = source.getChannelData(1);

  // Mild high-shelf tilt to reduce residual hiss after mid/side ops
  // applied as simple one-pole-ish pre-emphasis in mid domain only for keep-vocals
  for (let i = 0; i < length; i++) {
    const left = L[i] ?? 0;
    const right = R[i] ?? 0;
    const mid = (left + right) * 0.5;
    const side = (left - right) * 0.5;

    if (mode === "remove-vocals") {
      // Karaoke: emphasize sides, zero center
      const s = side * 1.35;
      oL[i] = clamp(s);
      oR[i] = clamp(-s);
    } else {
      // Keep centered content (often lead vocal + bass)
      // Slight width residual so it doesn't feel totally dead
      const m = mid * 1.15;
      const residual = side * 0.08;
      oL[i] = clamp(m + residual);
      oR[i] = clamp(m - residual);
    }
  }

  return out;
}

function clamp(v: number) {
  return Math.max(-1, Math.min(1, v));
}

export function cloneAudioBuffer(
  source: AudioBuffer,
  ctx: BaseAudioContext,
): AudioBuffer {
  const out = ctx.createBuffer(
    source.numberOfChannels,
    source.length,
    source.sampleRate,
  );
  for (let c = 0; c < source.numberOfChannels; c++) {
    out.copyToChannel(source.getChannelData(c), c);
  }
  return out;
}
