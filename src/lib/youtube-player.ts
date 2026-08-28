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
  getIframe?: () => HTMLIFrameElement;
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
const desiredPlaying = new Set<string>();
let apiPromise: Promise<void> | null = null;
let onEndedCb: ((clipId: string) => void) | null = null;
const playRetries = new Map<string, number>();
let keepTimer = 0;

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

function existingIds(ids?: string[]) {
  return idsOf(ids);
}

function hardenIframe(player: YtPlayer) {
  try {
    const iframe = player.getIframe?.();
    if (!iframe) return;
    iframe.setAttribute(
      "allow",
      "autoplay; encrypted-media; fullscreen; picture-in-picture",
    );
    iframe.setAttribute("allowfullscreen", "true");
  } catch {
    /* cross-origin or not ready */
  }
}

function stopKeepLoop() {
  if (!keepTimer) return;
  window.clearInterval(keepTimer);
  keepTimer = 0;
}

function ensureKeepLoop() {
  if (typeof window === "undefined") return;
  if (keepTimer) return;
  keepTimer = window.setInterval(() => {
    if (desiredPlaying.size === 0) {
      stopKeepLoop();
      return;
    }
    youtubeKeepPlaying([...desiredPlaying]);
  }, 220);
}

function markDesired(ids: string[], playing: boolean) {
  for (const id of ids) {
    if (playing) desiredPlaying.add(id);
    else desiredPlaying.delete(id);
  }
  if (desiredPlaying.size > 0) ensureKeepLoop();
  else stopKeepLoop();
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
        host: "https://www.youtube.com",
        playerVars: {
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          controls: 1,
          enablejsapi: 1,
          origin: window.location.origin,
          widget_referrer: window.location.origin,
          fs: 1,
          autoplay: 0,
        },
        events: {
          onReady: () => {
            const slot = slots.get(clipId);
            if (slot) slot.ready = true;
            hardenIframe(player);
            if (desiredPlaying.has(clipId)) kickPlay(clipId);
            finish();
          },
          onStateChange: (e: { data: number }) => {
            if (e.data === YT.PlayerState.ENDED) {
              desiredPlaying.delete(clipId);
              onEndedCb?.(clipId);
              return;
            }
            if (!desiredPlaying.has(clipId)) return;
            if (
              e.data === YT.PlayerState.PAUSED ||
              e.data === YT.PlayerState.CUED ||
              e.data === YT.PlayerState.UNSTARTED
            ) {
              kickPlay(clipId);
            }
          },
          onError: () => {
            finish();
          },
        },
      });
      slots.set(clipId, { player, ready: false });
      hardenIframe(player);
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
    desiredPlaying.delete(id);
    try {
      slot.player.destroy();
    } catch {
      /* already gone */
    }
    slots.delete(id);
    const t = playRetries.get(id);
    if (t) window.clearTimeout(t);
    playRetries.delete(id);
  }
  if (desiredPlaying.size === 0) stopKeepLoop();
}

export function isYouTubePlayerReady(clipId?: string) {
  if (clipId) return slots.has(clipId);
  return slots.size > 0;
}

export function youtubeGetPlayerState(clipId: string) {
  const slot = slots.get(clipId);
  if (!slot) return -1;
  try {
    return slot.player.getPlayerState();
  } catch {
    return -1;
  }
}

/**
 * Muted handshake: YouTube pauses sibling embeds, and the resume is
 * often outside a user gesture. playVideo() on an unmuted iframe is then
 * blocked. Mute → play → restore mute is allowed after the first gesture.
 */
function kickPlay(id: string) {
  const slot = slots.get(id);
  if (!slot) return false;
  try {
    const p = slot.player;
    let wantSound = true;
    try {
      wantSound = !p.isMuted();
    } catch {
      wantSound = true;
    }
    if (wantSound) {
      try {
        p.mute();
      } catch {
        /* noop */
      }
    }
    p.playVideo();
    if (wantSound) {
      try {
        p.unMute();
      } catch {
        /* noop */
      }
    }
    return true;
  } catch {
    return false;
  }
}

export function youtubePlay(ids?: string[]) {
  const list = existingIds(ids);
  markDesired(list, true);
  let ok = false;
  for (const id of list) {
    if (kickPlay(id)) ok = true;
    const prev = playRetries.get(id);
    if (prev) window.clearTimeout(prev);
    const later = window.setTimeout(() => {
      if (desiredPlaying.has(id)) kickPlay(id);
      playRetries.delete(id);
    }, 140);
    playRetries.set(id, later);
  }
  return ok || list.length > 0;
}

/** Re-start any player YouTube paused because another embed started. */
export function youtubeKeepPlaying(ids?: string[]) {
  let kicked = 0;
  const list = ids?.length ? ids : [...desiredPlaying];
  for (const id of list) {
    if (!desiredPlaying.has(id)) continue;
    const state = youtubeGetPlayerState(id);
    if (state === 1 || state === 3 || state === 0) continue;
    if (kickPlay(id)) kicked += 1;
  }
  return kicked;
}

export function youtubePause(ids?: string[]) {
  const list = existingIds(ids);
  markDesired(list, false);
  for (const id of list) {
    const t = playRetries.get(id);
    if (t) window.clearTimeout(t);
    playRetries.delete(id);
    try {
      slots.get(id)!.player.pauseVideo();
    } catch {
      /* noop */
    }
  }
}

export function youtubeStop(ids?: string[]) {
  const list = existingIds(ids);
  markDesired(list, false);
  for (const id of list) {
    const t = playRetries.get(id);
    if (t) window.clearTimeout(t);
    playRetries.delete(id);
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
  for (const id of existingIds(ids)) {
    try {
      slots.get(id)!.player.seekTo(t, true);
    } catch {
      /* noop */
    }
  }
}

export function youtubeGetCurrentTime(ids?: string[]) {
  for (const id of existingIds(ids)) {
    try {
      const slot = slots.get(id);
      if (!slot) continue;
      return slot.player.getCurrentTime() || 0;
    } catch {
      /* next */
    }
  }
  return 0;
}

export function youtubeGetDuration(ids?: string[]) {
  let max = 0;
  for (const id of existingIds(ids)) {
    try {
      max = Math.max(max, slots.get(id)!.player.getDuration() || 0);
    } catch {
      /* next */
    }
  }
  return max;
}

export function youtubeSetMuted(muted: boolean, ids?: string[]) {
  for (const id of existingIds(ids)) {
    try {
      const p = slots.get(id)!.player;
      if (muted) p.mute();
      else p.unMute();
    } catch {
      /* noop */
    }
  }
}
