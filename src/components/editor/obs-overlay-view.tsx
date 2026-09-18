import { useEffect, useRef } from "react";
import {
  subscribeObsOverlay,
  type ObsOverlayFrame,
} from "@/lib/audio/obs-overlay-bus";

const empty: ObsOverlayFrame = { scene: "", live: false, bars: [] };

export function ObsOverlayView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<ObsOverlayFrame>(empty);

  useEffect(() => subscribeObsOverlay((f) => {
    frameRef.current = f;
  }), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf = 0;
    const draw = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const cssW = Math.max(1, canvas.clientWidth);
      const cssH = Math.max(1, canvas.clientHeight);
      const w = Math.round(cssW * dpr);
      const h = Math.round(cssH * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      const frame = frameRef.current;
      const scene = frame.scene || "—";
      const live = frame.live;
      const bars = frame.bars.length ? frame.bars : emptyBars;

      ctx.font = "700 11px ui-sans-serif, system-ui, sans-serif";
      ctx.fillStyle = live ? "#5eead4" : "rgba(255,255,255,0.45)";
      ctx.fillText(live ? "LIVE" : "STANDBY", 16, cssH - 52);

      ctx.font = "700 32px ui-sans-serif, system-ui, sans-serif";
      ctx.fillStyle = "#fff";
      ctx.shadowColor = "rgba(0,0,0,0.7)";
      ctx.shadowBlur = 8;
      ctx.fillText(scene || "—", 16, cssH - 18);
      ctx.shadowBlur = 0;

      const left = 160;
      const right = 16;
      const bottom = 16;
      const top = 24;
      const areaW = Math.max(40, cssW - left - right);
      const areaH = Math.max(24, cssH - top - bottom);
      const n = bars.length;
      const gap = 1;
      const bw = Math.max(2, (areaW - gap * (n - 1)) / n);
      for (let i = 0; i < n; i++) {
        const v = Math.max(0, Math.min(1, bars[i] ?? 0));
        const bh = Math.max(2, v * areaH);
        ctx.fillStyle = `rgba(94, 234, 212, ${0.35 + v * 0.65})`;
        ctx.fillRect(left + i * (bw + gap), top + areaH - bh, bw, bh);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="block h-dvh w-full bg-transparent"
      aria-label="OBSオーバーレイ"
    />
  );
}

const emptyBars = Array.from({ length: 48 }, () => 0);
