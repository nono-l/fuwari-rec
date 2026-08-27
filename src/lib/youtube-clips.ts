export const MAX_YOUTUBE_CLIPS = 5;
export const YT_CHROME = 36;
export const YT_FLOAT_MIN_W = 176;
export const YT_FLOAT_MAX_W = 760;

export type YoutubeClip = {
  id: string;
  videoId: string;
  input: string;
  epoch: number;
  ready: boolean;
  pinned: boolean;
  floatX: number;
  floatY: number;
  floatW: number;
  muted: boolean;
  sync: boolean;
};

export function ytElementId(clipId: string) {
  return `fuwari-yt-player-${clipId}`;
}

export function clampFloatW(w: number) {
  return Math.max(YT_FLOAT_MIN_W, Math.min(YT_FLOAT_MAX_W, w));
}

export function ytVideoH(w: number) {
  return clampFloatW(w) * (9 / 16);
}

export function ytFrameH(w: number) {
  return YT_CHROME + ytVideoH(w);
}

export function newYoutubeClip(
  videoId: string,
  input: string,
  index: number,
): YoutubeClip {
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `yt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    videoId,
    input,
    epoch: 1,
    ready: false,
    pinned: false,
    floatX: 12 + index * 28,
    floatY: 88 + index * 36,
    floatW: 300,
    muted: false,
    sync: true,
  };
}
