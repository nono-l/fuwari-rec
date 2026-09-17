export type HowlLive = {
  locked: number[];
  rising: number[];
};

const empty: HowlLive = { locked: [], rising: [] };
const map = new Map<string, HowlLive>();
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

export function publishHowl(id: string, live: HowlLive) {
  map.set(id, live);
  emit();
}

export function clearHowl(id: string) {
  if (!map.has(id)) return;
  map.delete(id);
  emit();
}

export function readHowl(id: string): HowlLive {
  return map.get(id) ?? empty;
}

export function subscribeHowl(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function formatHowlHz(hz: number) {
  if (hz >= 1000) return `${(hz / 1000).toFixed(1)} kHz`;
  return `${Math.round(hz)} Hz`;
}
