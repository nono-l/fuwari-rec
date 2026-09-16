import { useEffect } from "react";
import { useWebGpuStore } from "@/lib/store/webgpu-store";
import { shouldUseWebGpu } from "@/lib/audio/webgpu";

export function WebGpuToggle({
  compact = false,
}: {
  compact?: boolean;
}) {
  const hydrate = useWebGpuStore((s) => s.hydrate);
  const hydrated = useWebGpuStore((s) => s.hydrated);
  const available = useWebGpuStore((s) => s.available);
  const prefer = useWebGpuStore((s) => s.prefer);
  const setPrefer = useWebGpuStore((s) => s.setPrefer);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const using = shouldUseWebGpu(prefer, available);
  const hint = !hydrated
    ? "この端末の GPU を確認しています"
    : !available
      ? "この端末では WebGPU が使えません。チェックしても CPU のままです"
      : prefer
        ? "重い段（AIボイスなど）で WebGPU を使います。EQやディレイは今までどおりです"
        : "オフのあいだは CPU / WASM だけです。使うときだけ入れてください";

  return (
    <label className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-2.5 py-2 text-[11px] text-foreground">
      <input
        type="checkbox"
        className="mt-0.5"
        checked={prefer}
        onChange={() => setPrefer(!prefer)}
      />
      <span>
        <span className="font-medium">
          WebGPU を使う
          {hydrated && (
            <span className="ml-1.5 font-normal text-muted-foreground">
              {using ? "使用中" : available ? "利用可" : "不可"}
            </span>
          )}
        </span>
        {!compact && (
          <span className="mt-0.5 block text-[10px] leading-relaxed text-muted-foreground">
            {hint}
          </span>
        )}
      </span>
    </label>
  );
}
