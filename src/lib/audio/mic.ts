/** True when the app is inside a cross-origin preview iframe. */
export function isEmbeddedPreview() {
  if (typeof window === "undefined") return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function micErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message === "INPUT_DISABLED") {
    return "入力がオフです。入力をオンにしてから試してください";
  }
  const name =
    err && typeof err === "object" && "name" in err
      ? String((err as { name: string }).name)
      : "";

  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    if (isEmbeddedPreview()) {
      return "プレビュー枠ではマイクが拒否されることがあります。新しいタブで開くか、アドレスバーの🔒からマイクを許可してください";
    }
    return "マイクの許可がありません。アドレスバーの🔒からマイクを許可してください";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "マイクが見つかりません。接続とOSの入力設定を確認してください";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "マイクを開けません。ほかのアプリが使っていないか確認してください";
  }
  if (
    name === "OverconstrainedError" ||
    name === "ConstraintNotSatisfiedError"
  ) {
    return "選んだマイクが使えません。入出力デバイスから別の入力を選んでください";
  }
  if (name === "SecurityError") {
    return "この表示環境ではマイクを使えません。新しいタブで開いてください";
  }
  if (name === "AbortError") {
    return "マイクの起動が中断されました。もう一度試してください";
  }
  if (name === "NotSupportedError") {
    return "このブラウザではマイクを使えません";
  }
  if (typeof navigator !== "undefined" && !navigator.mediaDevices?.getUserMedia) {
    return "このブラウザではマイクを使えません";
  }
  const detail = err instanceof Error && err.message ? err.message : name;
  return detail
    ? `マイクを開けませんでした（${detail}）`
    : "マイクを開けませんでした";
}

const PREFERRED: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
};

async function getAudio(audio: boolean | MediaTrackConstraints) {
  if (!navigator.mediaDevices?.getUserMedia) {
    const e = new Error("getUserMedia がありません");
    e.name = "NotFoundError";
    throw e;
  }
  return navigator.mediaDevices.getUserMedia({ audio, video: false });
}

function isDenied(err: unknown) {
  const name =
    err && typeof err === "object" && "name" in err
      ? String((err as { name: string }).name)
      : "";
  return (
    name === "NotAllowedError" ||
    name === "PermissionDeniedError" ||
    name === "SecurityError"
  );
}

/** Open a mic stream. Falls back from exact device → ideal → default → unconstrained. */
export async function openMicStream(
  deviceId?: string | null,
): Promise<MediaStream> {
  if (deviceId) {
    try {
      return await getAudio({ ...PREFERRED, deviceId: { exact: deviceId } });
    } catch (e) {
      if (isDenied(e)) throw e;
      try {
        return await getAudio({ ...PREFERRED, deviceId: { ideal: deviceId } });
      } catch (e2) {
        if (isDenied(e2)) throw e2;
      }
    }
  }
  try {
    return await getAudio(PREFERRED);
  } catch (e) {
    if (isDenied(e)) throw e;
    return await getAudio(true);
  }
}
