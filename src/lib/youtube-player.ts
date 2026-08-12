/**
 * Thin controller around the official YouTube IFrame API.
 * Lets the studio transport play / pause / stop / seek the embed.
 */

export type YtPlayerState = -1 | 0 | 1 | 2 | 3 | 5;

interface YtPlayer {
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  destroy: () => void;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  setVolume: (n: number) => void;
  getVolume: () => number;
  cueVideoById: (opts: { videoId: string; startSeconds?: number }) => void;
  loadVideoById: (opts: { videoId: string; startSeconds?: number }) => void;
}

interface YtNamespace {
  Player: new (
    el: string | HTMLElement,
    opts: Record<string, unknown>,
  ) => YtPlayer;
  PlayerState: {
    UNSTARTED: -1;
    ENDED: 0;
    PLAYING: 1;
    PAUSED: 2;
    BUFFERING: 3;
    CUED: 5;
  };
}

declare global {
  interface Window {
    YT?: YtNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let player: YtPlayer | null = null;
let ready = false;
let apiPromise: Promise<void> | null = null;
let onEndedCb: (() => void) | null = null;
let onReadyCb: (() => void) | null = null;

export function loadYouTubeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<void>((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      try {
        prev?.();
      } catch {
        /* ignore */
      }
      resolve();
    };

    if (!document.querySelector('script[src*="iframe_api"]')) {
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      s.async = true;
      document.head.appendChild(s);
    }

    const poll = window.setInterval(() => {
      if (window.YT?.Player) {
        window.clearInterval(poll);
        resolve();
      }
    }, 50);
    window.setTimeout(() => window.clearInterval(poll), 15000);
  });

  return apiPromise;
}

export function setYouTubeEndedHandler(cb: (() => void) | null) {
  onEndedCb = cb;
}

export function setYouTubeReadyHandler(cb: (() => void) | null) {
  onReadyCb = cb;
}

export async function mountYouTubePlayer(
  elementId: string,
  videoId: string,
): Promise<void> {
  await loadYouTubeApi();
  const YT = window.YT;
  if (!YT?.Player) {
    throw new Error("YouTube API を読み込めませんでした");
  }

  destroyYouTubePlayer();
  ready = false;

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    try {
      player = new YT.Player(elementId, {
        videoId,
        width: "100%",
        height: "100%",
        host: "https://www.youtube-nocookie.com",
        playerVars: {
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          controls: 1,
          enablejsapi: 1,
          origin: window.location.origin,
          fs: 1,
        },
        events: {
          onReady: () => {
            ready = true;
            onReadyCb?.();
            finish();
          },
          onStateChange: (e: { data: number }) => {
            if (e.data === YT.PlayerState.ENDED) {
              onEndedCb?.();
            }
          },
          onError: () => {
            finish();
          },
        },
      });
    } catch (err) {
      reject(err);
      return;
    }

    window.setTimeout(finish, 8000);
  });
}

export function destroyYouTubePlayer() {
  if (player) {
    try {
      player.destroy();
    } catch {
      /* already gone */
    }
  }
  player = null;
  ready = false;
}

export function isYouTubePlayerReady() {
  return ready && !!player;
}

export function youtubePlay() {
  if (!ready || !player) return false;
  try {
    player.playVideo();
    return true;
  } catch {
    return false;
  }
}

export function youtubePause() {
  if (!ready || !player) return;
  try {
    player.pauseVideo();
  } catch {
    /* noop */
  }
}

export function youtubeStop() {
  if (!ready || !player) return;
  try {
    player.stopVideo();
    player.seekTo(0, true);
  } catch {
    /* noop */
  }
}

export function youtubeSeek(seconds: number) {
  if (!ready || !player) return;
  try {
    player.seekTo(Math.max(0, seconds), true);
  } catch {
    /* noop */
  }
}

export function youtubeGetCurrentTime() {
  if (!ready || !player) return 0;
  try {
    return player.getCurrentTime() || 0;
  } catch {
    return 0;
  }
}

export function youtubeGetDuration() {
  if (!ready || !player) return 0;
  try {
    return player.getDuration() || 0;
  } catch {
    return 0;
  }
}

export function youtubeSetMuted(muted: boolean) {
  if (!ready || !player) return;
  try {
    if (muted) player.mute();
    else player.unMute();
  } catch {
    /* noop */
  }
}
