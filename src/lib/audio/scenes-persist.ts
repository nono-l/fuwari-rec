import {
  BUILTIN_SCENES,
  type SceneCapture,
  type SceneId,
  type SceneMeta,
} from "./scenes";

const KEY = "fuwari-scenes-v1";

export type ScenePersist = {
  list: SceneMeta[];
  bank: Partial<Record<SceneId, SceneCapture>>;
};

export function loadScenePersist(): ScenePersist | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ScenePersist;
    if (!Array.isArray(parsed.list) || !parsed.list.length) return null;
    const list = parsed.list
      .filter((s) => s && typeof s.id === "string" && typeof s.label === "string")
      .map((s) => ({
        id: s.id,
        label: s.label.trim().slice(0, 24) || s.id,
        hint: s.hint,
        remote: s.remote !== false,
        builtin: Boolean(s.builtin) || s.id === "talk" || s.id === "song" || s.id === "wait",
      }));
    for (const b of BUILTIN_SCENES) {
      if (!list.some((s) => s.id === b.id)) list.unshift({ ...b });
    }
    return { list, bank: parsed.bank && typeof parsed.bank === "object" ? parsed.bank : {} };
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
