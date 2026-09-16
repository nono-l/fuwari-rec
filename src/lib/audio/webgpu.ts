const PREF_KEY = "fuwari-prefer-webgpu";

export function readPreferWebGpu(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(PREF_KEY) === "1";
  } catch {
    return false;
  }
}

export function writePreferWebGpu(on: boolean) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(PREF_KEY, on ? "1" : "0");
  } catch {
    /* quota / private mode */
  }
}

export async function probeWebGpu(): Promise<boolean> {
  if (typeof navigator === "undefined") return false;
  const gpu = (
    navigator as Navigator & {
      gpu?: { requestAdapter: () => Promise<unknown> };
    }
  ).gpu;
  if (!gpu?.requestAdapter) return false;
  try {
    return Boolean(await gpu.requestAdapter());
  } catch {
    return false;
  }
}

/** True only when the user checked the box AND this browser has an adapter. */
export function shouldUseWebGpu(prefer: boolean, available: boolean) {
  return prefer && available;
}
