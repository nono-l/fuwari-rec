import { create } from "zustand";
import {
  aiRuntimeMode,
  clearAiRuntimeFile,
  listAiRuntimeMeta,
  saveAiRuntimeFile,
  type AiRuntimeMeta,
  type AiRuntimeMode,
  type AiRuntimeSlotId,
} from "@/lib/audio/ai-runtime";

type Slots = Record<AiRuntimeSlotId, AiRuntimeMeta | null>;

type AiRuntimeState = {
  hydrated: boolean;
  busy: AiRuntimeSlotId | null;
  error: string | null;
  slots: Slots;
  mode: AiRuntimeMode;
  hydrate: () => Promise<void>;
  setFile: (id: AiRuntimeSlotId, file: File) => Promise<void>;
  clearFile: (id: AiRuntimeSlotId) => Promise<void>;
};

const empty: Slots = {
  hubert: null,
  rmvpe: null,
  pretrained: null,
};

export const useAiRuntimeStore = create<AiRuntimeState>((set, get) => ({
  hydrated: false,
  busy: null,
  error: null,
  slots: empty,
  mode: "passthrough",

  hydrate: async () => {
    if (typeof indexedDB === "undefined") {
      set({ hydrated: true });
      return;
    }
    try {
      const slots = await listAiRuntimeMeta();
      set({
        slots,
        mode: aiRuntimeMode(slots),
        hydrated: true,
        error: null,
      });
    } catch (e) {
      console.error(e);
      set({
        hydrated: true,
        error: "土台の読み出しに失敗しました",
      });
    }
  },

  setFile: async (id, file) => {
    set({ busy: id, error: null });
    try {
      const meta = await saveAiRuntimeFile(id, file);
      const slots = { ...get().slots, [id]: meta };
      set({
        slots,
        mode: aiRuntimeMode(slots),
        busy: null,
      });
    } catch (e) {
      console.error(e);
      set({
        busy: null,
        error: "保存できませんでした。容量を確認してください",
      });
    }
  },

  clearFile: async (id) => {
    set({ busy: id, error: null });
    try {
      await clearAiRuntimeFile(id);
      const slots = { ...get().slots, [id]: null };
      set({
        slots,
        mode: aiRuntimeMode(slots),
        busy: null,
      });
    } catch (e) {
      console.error(e);
      set({
        busy: null,
        error: "削除できませんでした",
      });
    }
  },
}));
