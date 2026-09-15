import {
  createLiveHandle,
  liveChainKey,
  liveItemEnabled,
  liveItemId,
  type LiveFxItem,
  type LiveHandle,
} from "./live-fx";
import type { CablePatchbay } from "./cables";
import type { DeviceIoBay } from "./device-io";

/**
 * Ordered live FX chain (spectrum + OBS inserts interleaved).
 * Engine only owns the bus taps.
 */
export class InsertRack {
  readonly input: GainNode;
  readonly output: GainNode;
  private handles: LiveHandle[] = [];
  private items: LiveFxItem[] = [];
  private workletFactory: (() => AudioWorkletNode | null) | null = null;
  private cables: CablePatchbay | null = null;
  private devices: DeviceIoBay | null = null;

  constructor(private readonly ctx: BaseAudioContext) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.input.gain.value = 1;
    this.output.gain.value = 1;
    this.input.connect(this.output);
  }

  setWorkletFactory(fn: () => AudioWorkletNode | null) {
    this.workletFactory = fn;
  }

  setCableBus(bay: CablePatchbay | null) {
    this.cables = bay;
  }

  setDeviceBus(bay: DeviceIoBay | null) {
    this.devices = bay;
  }

  setLiveFx(items: LiveFxItem[]) {
    const prev = liveChainKey(this.items);
    this.items = items;
    const active = items.filter(liveItemEnabled);
    const key = liveChainKey(active);
    if (
      key === prev &&
      active.length === this.handles.length &&
      this.handles.length > 0
    ) {
      for (const item of active) {
        this.handles.find((h) => h.id === liveItemId(item))?.apply(item);
      }
      return;
    }
    this.rebuild();
  }

  rebuild() {
    this.disposeHandles();
    let prev: AudioNode = this.input;
    for (const item of this.items) {
      if (!liveItemEnabled(item)) continue;
      const handle = createLiveHandle(this.ctx, item, {
        workletFactory: this.workletFactory ?? undefined,
        cables: this.cables,
        devices: this.devices,
      });
      this.handles.push(handle);
      prev.connect(handle.input);
      prev = handle.output;
    }
    prev.connect(this.output);
  }

  dispose() {
    this.disposeHandles();
    try {
      this.input.disconnect();
    } catch {
      /* noop */
    }
    try {
      this.output.disconnect();
    } catch {
      /* noop */
    }
  }

  private disposeHandles() {
    for (const h of this.handles) h.dispose();
    this.handles = [];
    try {
      this.input.disconnect();
    } catch {
      /* noop */
    }
  }
}
