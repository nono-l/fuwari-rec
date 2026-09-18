import { useEffect, useRef } from "react";
import {
  subscribeObsOverlay,
  type ObsOverlayFrame,
} from "@/lib/audio/obs-overlay-bus";

const empty: ObsOverlayFrame = {
  scene: "",
  live: false,
  bars: [],
  caption: "",
  captionInterim: "",
};

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number) {
  const chars = [...text];
  const lines: string[] = [];
  let cur = "";
  for (const c of chars) {
    const next = cur + c;
    if (ctx.measureText(next).width > maxW && cur) {
      lines.push(cur);
      cur = c;
      if (lines.length >= maxLines) break;
    } else {
      cur = next;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  return lines;
}

function paintCaption(
  ctx: CanvasRenderingContext2D,
  cssW: number,
  cssH: number,
  frame: ObsOverlayFrame,
) {
  const main = (frame.caption || "").trim();
  const wait = (frame.captionInterim || "").trim();
  const raw = main || wait;
  if (!raw) return;
  const maxW = Math.max(120, cssW - 48);
  ctx.font = "700 28px ui-sans-serif, system-ui, 'Noto Sans JP', sans-serif";
  const lines = wrapText(ctx, raw, maxW, 2);
  if (!lines.length) return;
  const lineH = 36;
  const padX = 18;
  const padY = 12;
  const boxH = lines.length * lineH + padY * 2;
  const boxW = Math.min(
    maxW + padX * 2,
    Math.max(...lines.map((l) => ctx.measureText(l).width)) + padX * 2,
  );
  const x = (cssW - boxW) / 2;
  const y = cssH - boxH - 64;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.beginPath();
  const r = 12;
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + boxW, y, x + boxW, y + boxH, r);
  ctx.arcTo(x + boxW, y + boxH, x, y + boxH, r);
  ctx.arcTo(x, y + boxH, x, y, r);
  ctx.arcTo(x, y, x + boxW, y, r);
  ctx.closePath();
  ctx.fill();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(0,0,0,0.8)";
  ctx.fillStyle = main ? "#fff" : "rgba(255,255,255,0.72)";
  lines.forEach((line, i) => {
    const ty = y + padY + lineH * i + lineH / 2;
    ctx.strokeText(line, cssW / 2, ty);
    ctx.fillText(line, cssW / 2, ty);
  });
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.shadowBlur = 0;
}

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
      paintCaption(ctx, cssW, cssH, frame);
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
