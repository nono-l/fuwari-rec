import { useEffect } from "react";
import { useEditorStore } from "@/lib/store/editor-store";
import { getAudioEngine } from "@/lib/audio/engine";
import { downsampleSpectrum, publishObsOverlay } from "@/lib/audio/obs-overlay-bus";

/** Pushes scene + spectrum to the OBS overlay tab. */
export function ObsOverlayPublish() {
  const scene = useEditorStore((s) => s.activeSceneId);
  const sceneList = useEditorStore((s) => s.sceneList);
  const live = useEditorStore((s) => s.liveFxActive);

  useEffect(() => {
    let buf = new Uint8Array(1024);
    const tick = () => {
      let bars: number[] = [];
      try {
        const engine = getAudioEngine();
        const count = engine.getSpectrumBinCount() || 1024;
        if (buf.length !== count) buf = new Uint8Array(count);
        engine.fillSpectrum(buf);
        bars = downsampleSpectrum(buf);
      } catch {
        bars = [];
      }
      publishObsOverlay({
        scene: sceneList.find((s) => s.id === scene)?.label ?? scene ?? "",
        live,
        bars,
      });
    };
    tick();
    const id = window.setInterval(tick, 50);
    return () => window.clearInterval(id);
  }, [scene, sceneList, live]);

  return null;
}
