import { useEffect, useState } from "react";
import { SCENES } from "@/lib/audio/scenes";
import {
  subscribeObsOverlay,
  type ObsOverlayFrame,
} from "@/lib/audio/obs-overlay-bus";
import { cn } from "@/lib/utils";

const empty: ObsOverlayFrame = { scene: "", live: false, bars: [] };

export function ObsOverlayView() {
  const [frame, setFrame] = useState<ObsOverlayFrame>(empty);
  useEffect(() => subscribeObsOverlay(setFrame), []);

  const scene =
    SCENES.find((s) => s.id === frame.scene)?.label ?? frame.scene ?? "";
  const bars = frame.bars.length ? frame.bars : Array.from({ length: 48 }, () => 0);

  return (
    <div className="flex h-dvh flex-col justify-end bg-transparent p-4 text-white">
      <div className="flex items-end gap-4">
        <div className="min-w-[7rem]">
          <div
            className={cn(
              "text-[11px] font-semibold tracking-widest",
              frame.live ? "text-teal-300" : "text-white/50",
            )}
          >
            {frame.live ? "LIVE" : "STANDBY"}
          </div>
          <div className="text-3xl font-semibold drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
            {scene || "—"}
          </div>
        </div>
        <div className="flex h-16 flex-1 items-end gap-px">
          {bars.map((v, i) => (
            <div
              key={i}
              className="min-w-0 flex-1 rounded-t-sm bg-teal-300/90"
              style={{ height: `${Math.max(4, Math.round(v * 100))}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
