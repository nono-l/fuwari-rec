import { create } from "zustand";
import {
  probeWebGpu,
  readPreferWebGpu,
  writePreferWebGpu,
} from "@/lib/audio/webgpu";

type WebGpuState = {
  hydrated: boolean;
  available: boolean;
  prefer: boolean;
  hydrate: () => Promise<void>;
  setPrefer: (on: boolean) => void;
};

export const useWebGpuStore = create<WebGpuState>((set) => ({
  hydrated: false,
  available: false,
  prefer: false,

  hydrate: async () => {
    const prefer = readPreferWebGpu();
    const available = await probeWebGpu();
    set({ prefer, available, hydrated: true });
  },

  setPrefer: (on) => {
    writePreferWebGpu(on);
    set({ prefer: on });
  },
}));
