export const YT_PLAYER_ELEMENT_ID = "fuwari-yt-player";

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

type Slot = { player: YtPlayer; ready: boolean };

const slots = new Map<string, Slot>();
let apiPromise: Promise<void> | null = null;
let onEndedCb: ((clipId: string) => void) | null = null;

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

export function setYouTubeEndedHandler(cb: ((clipId: string) => void) | null) {
  onEndedCb = cb;
}

export function setYouTubeReadyHandler(_cb: (() => void) | null) {
  /* kept for compatibility */
}

function idsOf(ids?: string[]) {
  if (ids?.length) return ids.filter((id) => slots.has(id));
  return [...slots.keys()];
}

function readyIds(ids?: string[]) {
  return idsOf(ids).filter((id) => slots.get(id)?.ready);
}

export async function mountYouTubePlayer(
  clipId: string,
  elementId: string,
  videoId: string,
): Promise<void> {
  await loadYouTubeApi();
  const YT = window.YT;
  if (!YT?.Player) {
    throw new Error("YouTube API を読み込めませんでした");
  }

  destroyYouTubePlayer(clipId);

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    try {
      const player = new YT.Player(elementId, {
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
            const slot = slots.get(clipId);
            if (slot) slot.ready = true;
            finish();
          },
          onStateChange: (e: { data: number }) => {
            if (e.data === YT.PlayerState.ENDED) {
              onEndedCb?.(clipId);
            }
          },
          onError: () => {
            finish();
          },
        },
      });
      slots.set(clipId, { player, ready: false });
    } catch (err) {
      reject(err);
      return;
    }

    window.setTimeout(finish, 8000);
  });
}

export function destroyYouTubePlayer(clipId?: string) {
  const ids = clipId ? [clipId] : [...slots.keys()];
  for (const id of ids) {
    const slot = slots.get(id);
    if (!slot) continue;
    try {
      slot.player.destroy();
    } catch {
      /* already gone */
    }
    slots.delete(id);
  }
}

export function isYouTubePlayerReady(clipId?: string) {
  if (clipId) return !!slots.get(clipId)?.ready;
  return [...slots.values()].some((s) => s.ready);
}

export function youtubePlay(ids?: string[]) {
  let ok = false;
  for (const id of readyIds(ids)) {
    try {
      slots.get(id)!.player.playVideo();
      ok = true;
    } catch {
      /* noop */
    }
  }
  return ok;
}

export function youtubePause(ids?: string[]) {
  for (const id of readyIds(ids)) {
    try {
      slots.get(id)!.player.pauseVideo();
    } catch {
      /* noop */
    }
  }
}

export function youtubeStop(ids?: string[]) {
  for (const id of readyIds(ids)) {
    try {
      const p = slots.get(id)!.player;
      p.stopVideo();
      p.seekTo(0, true);
    } catch {
      /* noop */
    }
  }
}

export function youtubeSeek(seconds: number, ids?: string[]) {
  const t = Math.max(0, seconds);
  for (const id of readyIds(ids)) {
    try {
      slots.get(id)!.player.seekTo(t, true);
    } catch {
      /* noop */
    }
  }
}

export function youtubeGetCurrentTime(ids?: string[]) {
  for (const id of readyIds(ids)) {
    try {
      return slots.get(id)!.player.getCurrentTime() || 0;
    } catch {
      /* next */
    }
  }
  return 0;
}

export function youtubeGetDuration(ids?: string[]) {
  let max = 0;
  for (const id of readyIds(ids)) {
    try {
      max = Math.max(max, slots.get(id)!.player.getDuration() || 0);
    } catch {
      /* next */
    }
  }
  return max;
}

export function youtubeSetMuted(muted: boolean, ids?: string[]) {
  for (const id of readyIds(ids)) {
    try {
      const p = slots.get(id)!.player;
      if (muted) p.mute();
      else p.unMute();
    } catch {
      /* noop */
    }
  }
}
