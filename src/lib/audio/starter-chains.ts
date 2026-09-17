import {
  labelObsInserts,
  newObsInsert,
  type ObsInsert,
} from "./obs-filters";

export type StarterChainId = "stream" | "song" | "call";

export type StarterChain = {
  id: StarterChainId;
  label: string;
  hint: string;
  order: string;
};

export const STARTER_CHAINS: StarterChain[] = [
  {
    id: "stream",
    label: "配信",
    hint: "トーク向け。ノイズを抑え、音量差をならして配信先に出す",
    order: "ゲート → 抑制 → EQ → コンプ → リミッター",
  },
  {
    id: "song",
    label: "歌",
    hint: "語尾を残しつつ厚み。リミッターは余裕を残す",
    order: "ゲート → 抑制 → EQ → コンプ → リミッター",
  },
  {
    id: "call",
    label: "通話",
    hint: "声を前に、ファンを後ろへ。切れすぎない程度に強く",
    order: "ゲート → 抑制 → EQ → コンプ → リミッター",
  },
];

export function buildStarterChain(id: StarterChainId): ObsInsert[] {
  if (id === "song") {
    return labelObsInserts([
      newObsInsert("gate", {
        amount: 1,
        gate: {
          thresholdDb: -42,
          attackMs: 2,
          holdMs: 80,
          releaseMs: 120,
          floor: 0.12,
          mix: 1,
        },
      }),
      newObsInsert("denoise", {
        amount: 0.28,
        denoiseTune: {
          mix: 1,
          attack: 0.28,
          gateLink: false,
          thresholdDb: -40,
        },
      }),
      newObsInsert("eq3", {
        eq3Tune: {
          lowHz: 180,
          lowQ: 0.7,
          lowGain: 1.5,
          midHz: 1100,
          midQ: 0.7,
          midGain: 0.5,
          highHz: 6500,
          highQ: 0.7,
          highGain: 2,
        },
      }),
      newObsInsert("compressor", {
        amount: 1,
        comp: {
          thresholdDb: -16,
          ratio: 3,
          attackMs: 12,
          releaseMs: 220,
          kneeDb: 10,
          makeupDb: 1,
          mix: 1,
        },
      }),
      newObsInsert("limiter", {
        amount: 1,
        limiter: {
          ceilingDb: -3,
          lookaheadMs: 3,
          releaseMs: 80,
          makeupDb: 0,
          mix: 1,
        },
      }),
    ]);
  }
  if (id === "call") {
    return labelObsInserts([
      newObsInsert("gate", {
        amount: 1,
        gate: {
          thresholdDb: -34,
          attackMs: 2,
          holdMs: 30,
          releaseMs: 60,
          floor: 0.05,
          mix: 1,
        },
      }),
      newObsInsert("denoise", {
        amount: 0.55,
        denoiseTune: {
          mix: 1,
          attack: 0.55,
          gateLink: true,
          thresholdDb: -36,
        },
      }),
      newObsInsert("eq3", {
        eq3Tune: {
          lowHz: 160,
          lowQ: 0.8,
          lowGain: -2.5,
          midHz: 1250,
          midQ: 0.9,
          midGain: 2,
          highHz: 5500,
          highQ: 0.7,
          highGain: -0.5,
        },
      }),
      newObsInsert("compressor", {
        amount: 1,
        comp: {
          thresholdDb: -20,
          ratio: 5,
          attackMs: 6,
          releaseMs: 120,
          kneeDb: 6,
          makeupDb: 3,
          mix: 1,
        },
      }),
      newObsInsert("limiter", {
        amount: 1,
        limiter: {
          ceilingDb: -1,
          lookaheadMs: 1,
          releaseMs: 50,
          makeupDb: 0,
          mix: 1,
        },
      }),
    ]);
  }
  return labelObsInserts([
    newObsInsert("gate", {
      amount: 1,
      gate: {
        thresholdDb: -38,
        attackMs: 2,
        holdMs: 40,
        releaseMs: 80,
        floor: 0.08,
        mix: 1,
      },
    }),
    newObsInsert("denoise", {
      amount: 0.45,
      denoiseTune: {
        mix: 1,
        attack: 0.45,
        gateLink: true,
        thresholdDb: -38,
      },
    }),
    newObsInsert("eq3", {
      eq3Tune: {
        lowHz: 200,
        lowQ: 0.7,
        lowGain: -1,
        midHz: 1000,
        midQ: 0.8,
        midGain: 1.5,
        highHz: 5000,
        highQ: 0.7,
        highGain: 1,
      },
    }),
    newObsInsert("compressor", {
      amount: 1,
      comp: {
        thresholdDb: -18,
        ratio: 4,
        attackMs: 8,
        releaseMs: 150,
        kneeDb: 8,
        makeupDb: 2,
        mix: 1,
      },
    }),
    newObsInsert("limiter", {
      amount: 1,
      limiter: {
        ceilingDb: -1.5,
        lookaheadMs: 2,
        releaseMs: 60,
        makeupDb: 0,
        mix: 1,
      },
    }),
  ]);
}
