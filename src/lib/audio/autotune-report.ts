export type AutotuneLive = {
  hz: number;
  note: string;
  target: string;
  cents: number;
};

const map = new Map<string, AutotuneLive | null>();
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

export function publishAutotune(id: string, live: AutotuneLive | null) {
  map.set(id, live);
  emit();
}

export function clearAutotune(id: string) {
  if (!map.has(id)) return;
  map.delete(id);
  emit();
}

export function readAutotune(id: string): AutotuneLive | null {
  return map.get(id) ?? null;
}

export function subscribeAutotune(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
