import { useCallback, useEffect, useSyncExternalStore } from "react";

const TARGET_KEY = "fuwari-list-target";
const HIDDEN_KEY = "fuwari-list-hidden";

type Snapshot = {
  soulId: string;
  hidden: string[];
  ackedDisk: string;
  diskSoulId: string;
};

const listeners = new Set<() => void>();
let memory: Snapshot = { soulId: "", hidden: [], ackedDisk: "", diskSoulId: "" };
let hydrated = false;

function parseHidden(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const hidden = JSON.parse(raw) as unknown;
    return Array.isArray(hidden) ? hidden.map((s) => String(s)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function readDisk(): { soulId: string; hidden: string[] } {
  if (typeof window === "undefined") return { soulId: "", hidden: [] };
  try {
    return {
      soulId: String(localStorage.getItem(TARGET_KEY) ?? ""),
      hidden: parseHidden(localStorage.getItem(HIDDEN_KEY)),
    };
  } catch {
    return { soulId: "", hidden: [] };
  }
}

function emit(next: Snapshot) {
  memory = next;
  listeners.forEach((fn) => fn());
}

function writeStorage(soulId: string, hidden: string[]) {
  try {
    localStorage.setItem(TARGET_KEY, soulId);
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(hidden));
  } catch {
    /* private mode */
  }
  emit({ soulId, hidden, ackedDisk: "", diskSoulId: soulId });
}

function ensureHydrated() {
  if (hydrated || typeof window === "undefined") return;
  const disk = readDisk();
  memory = {
    soulId: disk.soulId,
    hidden: disk.hidden,
    ackedDisk: "",
    diskSoulId: disk.soulId,
  };
  hydrated = true;
}

function subscribe(fn: () => void) {
  ensureHydrated();
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function getSnapshot(): Snapshot {
  ensureHydrated();
  return memory;
}

export function useListTarget() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    const syncDisk = () => {
      const disk = readDisk();
      if (disk.soulId === memory.diskSoulId) return;
      emit({ ...memory, diskSoulId: disk.soulId });
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key !== TARGET_KEY && e.key !== HIDDEN_KEY && e.key !== null) return;
      syncDisk();
    };
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", syncDisk);
    return () => {
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", syncDisk);
    };
  }, []);

  const setSoulId = useCallback((soulId: string) => {
    writeStorage(soulId, memory.hidden);
  }, []);

  const hideSoul = useCallback((soulId: string) => {
    if (!soulId) return;
    const hidden = memory.hidden.includes(soulId)
      ? memory.hidden
      : [...memory.hidden, soulId];
    const soulIdNext = memory.soulId === soulId ? "" : memory.soulId;
    writeStorage(soulIdNext, hidden);
  }, []);

  const unhideSoul = useCallback((soulId: string) => {
    writeStorage(
      memory.soulId,
      memory.hidden.filter((s) => s !== soulId),
    );
  }, []);

  const followDisk = useCallback(() => {
    const disk = readDisk();
    emit({
      ...memory,
      soulId: disk.soulId,
      ackedDisk: "",
      diskSoulId: disk.soulId,
    });
  }, []);

  const keepTab = useCallback(() => {
    emit({ ...memory, ackedDisk: memory.diskSoulId });
  }, []);

  const mismatched =
    snap.diskSoulId !== snap.soulId && snap.diskSoulId !== snap.ackedDisk;

  return {
    soulId: snap.soulId,
    hidden: snap.hidden,
    diskSoulId: snap.diskSoulId,
    mismatched,
    setSoulId,
    hideSoul,
    unhideSoul,
    followDisk,
    keepTab,
  };
}
