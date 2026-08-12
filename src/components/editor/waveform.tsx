import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface WaveformProps {
  buffer: AudioBuffer | null;
  color: string;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  className?: string;
}

export function Waveform({
  buffer,
  color,
  currentTime,
  duration,
  onSeek,
  className,
}: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const dpr = window.devicePixelRatio || 1;
    const width = wrap.clientWidth;
    const height = wrap.clientHeight;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = "transparent";
    ctx.clearRect(0, 0, width, height);

    // soft rail
    ctx.fillStyle = "color-mix(in oklab, var(--color-muted) 55%, transparent)";
    ctx.fillRect(0, height / 2 - 0.5, width, 1);

    if (!buffer) return;

    const data = buffer.getChannelData(0);
    const step = Math.max(1, Math.ceil(data.length / width));
    const amp = height / 2;

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.25;
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    for (let i = 0; i < width; i++) {
      let min = 1;
      let max = -1;
      const start = i * step;
      for (let j = 0; j < step; j++) {
        const v = data[start + j] ?? 0;
        if (v < min) min = v;
        if (v > max) max = v;
      }
      ctx.moveTo(i, (1 + min) * amp);
      ctx.lineTo(i, (1 + max) * amp);
    }
    ctx.stroke();

    ctx.globalAlpha = 0.18;
    ctx.fillStyle = color;
    for (let i = 0; i < width; i++) {
      let peak = 0;
      const start = i * step;
      for (let j = 0; j < step; j++) {
        peak = Math.max(peak, Math.abs(data[start + j] ?? 0));
      }
      const h = peak * amp;
      ctx.fillRect(i, amp - h, 1, h * 2);
    }
    ctx.globalAlpha = 1;
  }, [buffer, color]);

  const total = Math.max(duration, buffer?.duration ?? 0, 0.001);
  const ratio = Math.min(1, Math.max(0, currentTime / total));

  return (
    <div
      ref={wrapRef}
      className={cn(
        "relative h-16 w-full cursor-pointer overflow-hidden rounded-lg border border-border bg-card",
        className,
      )}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const r = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
        onSeek(r * total);
      }}
      role="slider"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={currentTime}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") onSeek(Math.max(0, currentTime - 0.5));
        if (e.key === "ArrowRight") onSeek(currentTime + 0.5);
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {!buffer && (
        <div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">
          音源なし — 録音または読み込み
        </div>
      )}
      <div
        className="pointer-events-none absolute top-0 bottom-0 z-10 w-0.5 bg-primary shadow-[0_0_8px_color-mix(in_oklab,var(--color-primary)_50%,transparent)]"
        style={{ left: `${ratio * 100}%` }}
      />
    </div>
  );
}
