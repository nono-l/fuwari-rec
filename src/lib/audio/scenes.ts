import { buildStarterChain } from "./starter-chains";
import { labelObsInserts, newObsInsert } from "./obs-filters";
import type { ProcessHold } from "./live-fx";
import type { LiveSlot } from "./live-fx";

export type SceneId = "talk" | "song" | "wait";

export type SceneMeta = {
  id: SceneId;
  label: string;
  key: "1" | "2" | "3";
  hint: string;
};

export const SCENES: SceneMeta[] = [
  {
    id: "talk",
    label: "トーク",
    key: "1",
    hint: "配信トーク。ゲート→抑制→EQ→コンプ→リミッター",
  },
  {
    id: "song",
    label: "歌",
    key: "2",
    hint: "歌。語尾を残して厚み",
  },
  {
    id: "wait",
    label: "待機",
    key: "3",
    hint: "離席。ゲートを強めて部屋を落とす",
  },
];

export type SceneExtraCapture = {
  number: number;
  enabled: boolean;
  hold: ProcessHold;
  liveChain: LiveSlot[];
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
  const obs =
    id === "song"
      ? buildStarterChain("song")
      : id === "wait"
        ? buildWaitChain()
        : buildStarterChain("stream");
  const main = holdFromObs(obs);
  return {
    main,
    mainChain: obs.map((f) => ({ family: "obs" as const, id: f.id })),
    extras: [],
  };
}

export function sceneByKey(code: string): SceneId | null {
  if (code === "Digit1" || code === "Numpad1") return "talk";
  if (code === "Digit2" || code === "Numpad2") return "song";
  if (code === "Digit3" || code === "Numpad3") return "wait";
  return null;
}
