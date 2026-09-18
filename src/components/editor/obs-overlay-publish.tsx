import { useEffect } from "react";
import { useEditorStore } from "@/lib/store/editor-store";
import { getAudioEngine } from "@/lib/audio/engine";
import { downsampleSpectrum, publishObsOverlay } from "@/lib/audio/obs-overlay-bus";

/** Pushes scene + spectrum to the OBS overlay tab. */
export function ObsOverlayPublish() {
  const scene = useEditorStore((s) => s.activeSceneId);
  const live = useEditorStore((s) => s.liveFxActive);

  useEffect(() => {
    let raf = 0;
    const buf = new Uint8Array(2048);
    const tick = () => {
      let bars: number[] = [];
      try {
        getAudioEngine().fillSpectrum(buf);
        bars = downsampleSpectrum(buf);
      } catch {
        bars = [];
      }
      publishObsOverlay({ scene, live, bars });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scene, live]);

  return null;
}
