import {
  BUILTIN_SCENES,
  MAX_SCENES,
  isBuiltinScene,
  type SceneCapture,
  type SceneId,
  type SceneMeta,
} from "./scenes";

const KEY = "fuwari-scenes-v1";

export type ScenePersist = {
  list: SceneMeta[];
  bank: Partial<Record<SceneId, SceneCapture>>;
};

export function normalizeScenePersist(raw: unknown): ScenePersist | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = raw as ScenePersist;
  if (!Array.isArray(parsed.list) || !parsed.list.length) return null;
  const list = parsed.list
    .filter((s) => s && typeof s.id === "string" && typeof s.label === "string")
    .slice(0, MAX_SCENES)
    .map((s) => ({
      id: String(s.id).slice(0, 48),
      label: s.label.trim().slice(0, 24) || s.id,
      hint: typeof s.hint === "string" ? s.hint.slice(0, 80) : undefined,
      remote: s.remote !== false,
      builtin: Boolean(s.builtin) || isBuiltinScene(s.id),
    }));
  for (const b of BUILTIN_SCENES) {
    if (!list.some((s) => s.id === b.id)) list.unshift({ ...b });
  }
  const bank =
    parsed.bank && typeof parsed.bank === "object" ? parsed.bank : {};
  return { list, bank };
}

export function loadScenePersist(): ScenePersist | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    return normalizeScenePersist(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveScenePersist(list: SceneMeta[], bank: Partial<Record<SceneId, SceneCapture>>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ list, bank }));
  } catch {
    /* quota */
  }
}
