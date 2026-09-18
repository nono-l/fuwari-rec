import { buildStarterChain } from "./starter-chains";
import { labelObsInserts, newObsInsert } from "./obs-filters";
import type { ProcessHold, LiveSlot } from "./live-fx";
import type { DuckTune } from "./fx-pipeline";

export type SceneId = string;

export type SceneMeta = {
  id: SceneId;
  label: string;
  hint?: string;
  remote: boolean;
  builtin?: boolean;
};

export const MAX_SCENES = 12;

export const BUILTIN_SCENES: SceneMeta[] = [
  {
    id: "talk",
    label: "トーク",
    hint: "配信トーク。ゲート→抑制→EQ→コンプ→リミッター",
    remote: true,
    builtin: true,
  },
  {
    id: "song",
    label: "歌",
    hint: "歌。語尾を残して厚み",
    remote: true,
    builtin: true,
  },
  {
    id: "wait",
    label: "待機",
    hint: "離席。ゲートを強めて部屋を落とす",
    remote: true,
    builtin: true,
  },
];

/** @deprecated use sceneList from the store. Built-in three. */
export const SCENES = BUILTIN_SCENES;

export function newSceneId() {
  const n =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `sc-${n}`;
}

export function isBuiltinScene(id: SceneId) {
  return id === "talk" || id === "song" || id === "wait";
}

export function sceneLabelOf(id: SceneId, list: SceneMeta[]) {
  return list.find((s) => s.id === id)?.label ?? id;
}

export function sceneKeyIndex(list: SceneMeta[], id: SceneId) {
  const i = list.findIndex((s) => s.id === id);
  return i >= 0 && i < 9 ? String(i + 1) : "";
}

export function sceneByKey(code: string, list: SceneMeta[] = BUILTIN_SCENES): SceneId | null {
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(code);
  if (!m) return null;
  return list[Number(m[1]) - 1]?.id ?? null;
}

export type RemoteSceneBtn = { id: SceneId; label: string };

export function remoteSceneButtons(list: SceneMeta[]): RemoteSceneBtn[] {
  return list.filter((s) => s.remote).map((s) => ({ id: s.id, label: s.label }));
}

export type SceneExtraCapture = {
  number: number;
  enabled: boolean;
  hold: ProcessHold;
  liveChain: LiveSlot[];
  duck: DuckTune;
};

export type SceneCapture = {
  main: ProcessHold;
  mainChain: LiveSlot[];
  extras: SceneExtraCapture[];
};

function holdFromObs(obs: ReturnType<typeof buildStarterChain>): ProcessHold {
  return {
    spectrumFilters: [],
    obsInserts: obs,
    aiVoice: null,
  };
}

function buildWaitChain() {
  return labelObsInserts([
    newObsInsert("gate", {
      amount: 1,
      gate: {
        thresholdDb: -28,
        attackMs: 2,
        holdMs: 20,
        releaseMs: 40,
        floor: 0.03,
        mix: 1,
      },
    }),
    newObsInsert("denoise", {
      amount: 0.65,
      denoiseTune: {
        mix: 1,
        attack: 0.65,
        gateLink: true,
        thresholdDb: -30,
      },
    }),
    newObsInsert("limiter", {
      amount: 1,
      limiter: {
        ceilingDb: -1,
        lookaheadMs: 1,
        releaseMs: 40,
        makeupDb: 0,
        mix: 1,
      },
    }),
  ]);
}

export function factoryScene(id: SceneId): SceneCapture {
  const kind = id === "song" ? "song" : id === "wait" ? "wait" : "talk";
  const obs =
    kind === "song"
      ? buildStarterChain("song")
      : kind === "wait"
        ? buildWaitChain()
        : buildStarterChain("stream");
  const main = holdFromObs(obs);
  return {
    main,
    mainChain: obs.map((f) => ({ family: "obs" as const, id: f.id })),
    extras: [],
  };
}
