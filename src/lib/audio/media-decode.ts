/**
 * Decode audio from audio *or* video files in the browser.
 * 1) Prefer AudioContext.decodeAudioData (works for many containers)
 * 2) Fallback: play via <video>/<audio> + MediaRecorder capture
 */

const VIDEO_EXTS = [
  ".mp4",
  ".webm",
  ".mov",
  ".mkv",
  ".m4v",
  ".avi",
  ".ogv",
  ".mpeg",
  ".mpg",
  ".3gp",
] as const;

const AUDIO_EXTS = [
  ".wav",
  ".mp3",
  ".ogg",
  ".m4a",
  ".flac",
  ".aac",
  ".opus",
  ".aiff",
  ".aif",
  ".wma",
] as const;

export const MEDIA_FILE_ACCEPT = [
  "audio/*",
  "video/*",
  ...AUDIO_EXTS,
  ...VIDEO_EXTS,
  ".mid",
  ".midi",
].join(",");

export function isVideoFile(file: File): boolean {
  const name = file.name.toLowerCase();
  if (file.type.startsWith("video/")) return true;
  return VIDEO_EXTS.some((ext) => name.endsWith(ext));
}

export function isAudioFile(file: File): boolean {
  const name = file.name.toLowerCase();
  if (file.type.startsWith("audio/")) return true;
  return AUDIO_EXTS.some((ext) => name.endsWith(ext));
}

export function looksLikeMediaFile(file: File): boolean {
  return (
    isVideoFile(file) ||
    isAudioFile(file) ||
    file.type.startsWith("video/") ||
    file.type.startsWith("audio/")
  );
}

/**
 * Decode a media file (audio or video container) into an AudioBuffer.
 */
export async function decodeMediaFile(
  file: File,
  ctx: AudioContext,
): Promise<AudioBuffer> {
  try {
    const ab = await file.arrayBuffer();
    return await ctx.decodeAudioData(ab.slice(0));
  } catch {
    /* try element path */
  }

  return extractViaMediaElement(file, ctx);
}

async function extractViaMediaElement(
  file: File,
  ctx: AudioContext,
): Promise<AudioBuffer> {
  if (ctx.state === "suspended") {
    await ctx.resume();
  }

  const url = URL.createObjectURL(file);
  const useVideo = isVideoFile(file);
  const el = document.createElement(useVideo ? "video" : "audio");
  el.src = url;
  el.preload = "auto";
  el.muted = false;
  if (useVideo) {
    (el as HTMLVideoElement).playsInline = true;
  }
  el.crossOrigin = "anonymous";
  el.style.display = "none";
  document.body.appendChild(el);

  try {
    await new Promise<void>((resolve, reject) => {
      const onMeta = () => resolve();
      const onErr = () =>
        reject(new Error("動画／音声ファイルを開けませんでした"));
      el.addEventListener("loadedmetadata", onMeta, { once: true });
      el.addEventListener("error", onErr, { once: true });
      el.load();
    });

    const duration = Number.isFinite(el.duration) ? el.duration : 0;
    if (duration <= 0 || duration === Infinity) {
      throw new Error("このファイルから長さを取得できませんでした");
    }
    if (duration > 30 * 60) {
      throw new Error("30分を超えるメディアは読み込めません");
    }

    const source = ctx.createMediaElementSource(el);
    const dest = ctx.createMediaStreamDestination();
    const silent = ctx.createGain();
    silent.gain.value = 0;
    source.connect(dest);
    source.connect(silent);
    silent.connect(ctx.destination);

    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";

    const recorder = new MediaRecorder(
      dest.stream,
      mime ? { mimeType: mime } : undefined,
    );
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    const stopped = new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => {
        resolve(
          new Blob(chunks, {
            type: recorder.mimeType || "audio/webm",
          }),
        );
      };
      recorder.onerror = () => reject(new Error("音声抽出に失敗しました"));
    });

    recorder.start(200);
    el.currentTime = 0;
    await el.play();

    await new Promise<void>((resolve, reject) => {
      const t = window.setTimeout(
        () => {
          try {
            el.pause();
          } catch {
            /* noop */
          }
          resolve();
        },
        Math.ceil(duration * 1000) + 1500,
      );
      el.onended = () => {
        window.clearTimeout(t);
        resolve();
      };
      el.onerror = () => {
        window.clearTimeout(t);
        reject(new Error("再生中にエラーが発生しました"));
      };
    });

    if (recorder.state !== "inactive") {
      recorder.stop();
    }
    const blob = await stopped;

    try {
      source.disconnect();
      silent.disconnect();
    } catch {
      /* noop */
    }

    if (blob.size < 64) {
      throw new Error("音声トラックが見つからないか、抽出に失敗しました");
    }

    const outAb = await blob.arrayBuffer();
    return await ctx.decodeAudioData(outAb.slice(0));
  } finally {
    try {
      el.pause();
      el.removeAttribute("src");
      el.load();
      el.remove();
    } catch {
      /* noop */
    }
    URL.revokeObjectURL(url);
  }
}
