export interface AudioDeviceInfo {
  deviceId: string;
  label: string;
  kind: "audioinput" | "audiooutput";
  groupId: string;
}

type AudioContextSinkProto = {
  setSinkId?: (sinkId: string) => Promise<void>;
};

export function supportsOutputSinkSelection(): boolean {
  if (typeof window === "undefined") return false;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return false;
  return typeof (AC.prototype as AudioContextSinkProto).setSinkId === "function";
}

/** Labels stay empty until mic permission is granted at least once. */
export async function ensureMicPermission(): Promise<boolean> {
  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices?.getUserMedia
  ) {
    return false;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch {
    return false;
  }
}

export async function listAudioDevices(): Promise<{
  inputs: AudioDeviceInfo[];
  outputs: AudioDeviceInfo[];
}> {
  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices?.enumerateDevices
  ) {
    return { inputs: [], outputs: [] };
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  const inputs: AudioDeviceInfo[] = [];
  const outputs: AudioDeviceInfo[] = [];

  let inIdx = 0;
  let outIdx = 0;
  for (const d of devices) {
    if (d.kind === "audioinput") {
      inIdx += 1;
      inputs.push({
        deviceId: d.deviceId,
        label: d.label || `マイク ${inIdx}`,
        kind: "audioinput",
        groupId: d.groupId,
      });
    } else if (d.kind === "audiooutput") {
      outIdx += 1;
      outputs.push({
        deviceId: d.deviceId,
        label: d.label || `スピーカー ${outIdx}`,
        kind: "audiooutput",
        groupId: d.groupId,
      });
    }
  }

  return { inputs, outputs };
}

export function subscribeDeviceChanges(cb: () => void): () => void {
  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices?.addEventListener
  ) {
    return () => {};
  }
  const handler = () => cb();
  navigator.mediaDevices.addEventListener("devicechange", handler);
  return () =>
    navigator.mediaDevices.removeEventListener("devicechange", handler);
}
