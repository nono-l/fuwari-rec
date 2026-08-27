import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/lib/store/editor-store";
import {
  clampFloatW,
  ytElementId,
  ytFrameH,
  YT_CHROME,
  type YoutubeClip,
} from "@/lib/youtube-clips";
import {
  destroyYouTubePlayer,
  mountYouTubePlayer,
} from "@/lib/youtube-player";

function clampPos(x: number, y: number, w: number, h: number) {
  const maxX = Math.max(8, window.innerWidth - w - 8);
  const maxY = Math.max(8, window.innerHeight - h - 8);
  return {
    x: Math.min(maxX, Math.max(8, x)),
    y: Math.min(maxY, Math.max(8, y)),
  };
}

export function YoutubePlayerHost() {
  const clips = useEditorStore((s) => s.youtubeClips);
  return (
    <>
      {clips.map((clip, i) => (
        <YoutubePane key={clip.id} clip={clip} index={i} />
      ))}
    </>
  );
}

function YoutubePane({ clip, index }: { clip: YoutubeClip; index: number }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const setYoutubeReady = useEditorStore((s) => s.setYoutubeReady);
  const setYoutubePinned = useEditorStore((s) => s.setYoutubePinned);
  const toggleYoutubePinned = useEditorStore((s) => s.toggleYoutubePinned);
  const setYoutubeFloatPos = useEditorStore((s) => s.setYoutubeFloatPos);
  const setYoutubeFloatSize = useEditorStore((s) => s.setYoutubeFloatSize);
  const removeYoutubeClip = useEditorStore((s) => s.removeYoutubeClip);

  const [box, setBox] = useState({
    x: clip.floatX,
    y: clip.floatY,
    w: clip.floatW,
    h: ytFrameH(clip.floatW),
    visible: false,
  });
  const [mounting, setMounting] = useState(false);
  const [zBoost, setZBoost] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ dist: number; w: number } | null>(null);
  const resizeRef = useRef<{
    pointerId: number;
    startX: number;
    startW: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setMounting(true);
    setYoutubeReady(false, clip.id);
    void (async () => {
      try {
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        if (cancelled) return;
        const el = document.getElementById(ytElementId(clip.id));
        if (!el) return;
        await mountYouTubePlayer(clip.id, ytElementId(clip.id), clip.videoId);
        if (cancelled) return;
        setYoutubeReady(true, clip.id);
      } catch (e) {
        console.error(e);
        if (!cancelled) setYoutubeReady(false, clip.id);
      } finally {
        if (!cancelled) setMounting(false);
      }
    })();
    return () => {
      cancelled = true;
      destroyYouTubePlayer(clip.id);
    };
  }, [clip.id, clip.videoId, clip.epoch, setYoutubeReady]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (clip.pinned) {
        const w = clampFloatW(clip.floatW);
        const h = ytFrameH(w);
        const p = clampPos(clip.floatX, clip.floatY, w, h);
        setBox({ x: p.x, y: p.y, w, h, visible: true });
      } else {
        const slot = document.querySelector(
          `[data-yt-dock-slot="${clip.id}"]`,
        );
        if (slot) {
          const r = slot.getBoundingClientRect();
          setBox({
            x: r.left,
            y: r.top - YT_CHROME,
            w: Math.max(160, r.width),
            h: r.height + YT_CHROME,
            visible: r.width > 8 && r.height > 8,
          });
        } else {
          setBox((b) => ({ ...b, visible: false }));
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [clip.pinned, clip.floatX, clip.floatY, clip.floatW, clip.id, pathname]);

  const commitPinch = (clientPoints: { x: number; y: number }[]) => {
    if (clientPoints.length < 2) {
      pinchRef.current = null;
      return;
    }
    const [a, b] = clientPoints;
    const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
    if (dist < 8) return;
    if (!pinchRef.current) {
      pinchRef.current = { dist, w: box.w };
      if (!clip.pinned) setYoutubePinned(true, clip.id);
      return;
    }
    const scale = dist / pinchRef.current.dist;
    const next = clampFloatW(pinchRef.current.w * scale);
    setYoutubeFloatSize(next, clip.id);
  };

  const onChromePointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-yt-resize]")) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setZBoost(true);
    if (pointersRef.current.size === 1) {
      const start = clip.pinned
        ? clampPos(clip.floatX, clip.floatY, box.w, box.h)
        : { x: box.x, y: box.y };
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        origX: start.x,
        origY: start.y,
        moved: false,
      };
    } else {
      dragRef.current = null;
      commitPinch([...pointersRef.current.values()]);
    }
  };

  const onChromePointerMove = (e: React.PointerEvent) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size >= 2) {
      commitPinch([...pointersRef.current.values()]);
      return;
    }
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < 8) return;
    if (!d.moved) {
      d.moved = true;
      if (!clip.pinned) {
        setYoutubePinned(true, clip.id);
        setYoutubeFloatSize(Math.max(clip.floatW, box.w), clip.id);
      }
    }
    const w = clampFloatW(clip.floatW);
    const p = clampPos(d.origX + dx, d.origY + dy, w, ytFrameH(w));
    setYoutubeFloatPos(p.x, p.y, clip.id);
  };

  const onChromePointerUp = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    pinchRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    const d = dragRef.current;
    if (d && d.pointerId === e.pointerId) {
      dragRef.current = null;
      if (!d.moved && (e.target as HTMLElement).closest("[data-yt-pin]")) {
        if (!clip.pinned) {
          setYoutubeFloatPos(box.x, box.y, clip.id);
          setYoutubeFloatSize(Math.max(clip.floatW, Math.min(360, box.w)), clip.id);
        }
        toggleYoutubePinned(clip.id);
      }
    }
    if (pointersRef.current.size === 0) setZBoost(false);
  };

  const onResizeDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (!clip.pinned) {
      setYoutubePinned(true, clip.id);
      setYoutubeFloatPos(box.x, box.y, clip.id);
    }
    resizeRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startW: box.w,
    };
    setZBoost(true);
  };

  const onResizeMove = (e: React.PointerEvent) => {
    const r = resizeRef.current;
    if (!r || r.pointerId !== e.pointerId) return;
    const next = clampFloatW(r.startW + (e.clientX - r.startX));
    setYoutubeFloatSize(next, clip.id);
  };

  const onResizeUp = (e: React.PointerEvent) => {
    if (resizeRef.current?.pointerId === e.pointerId) resizeRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    setZBoost(false);
  };

  const label = `YouTube ${index + 1}`;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card shadow-lg",
        clip.pinned || zBoost ? "z-[46]" : "z-20",
        box.visible ? "pointer-events-auto" : "pointer-events-none",
      )}
      style={{
        position: "fixed",
        left: box.visible ? box.x : -4000,
        top: box.visible ? box.y : 0,
        width: box.w,
        height: box.h,
        opacity: box.visible ? 1 : 0,
        zIndex: clip.pinned || zBoost ? 46 + index : 20,
      }}
    >
      <div
        className="flex h-9 touch-none items-center gap-1 border-b border-border bg-muted/80 px-1.5"
        onPointerDown={onChromePointerDown}
        onPointerMove={onChromePointerMove}
        onPointerUp={onChromePointerUp}
        onPointerCancel={onChromePointerUp}
      >
        <button
          type="button"
          data-yt-pin
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full text-base leading-none",
            clip.pinned
              ? "bg-primary text-primary-foreground"
              : "hover:bg-background",
          )}
          aria-label={
            clip.pinned
              ? "ピン留めを外す。ドラッグで移動、ピンチで拡大縮小"
              : "ピン留めして追従"
          }
          aria-pressed={clip.pinned}
        >
          📍
        </button>
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">
          {clip.pinned
            ? `${label} · ドラッグ／ピンチ／右下でサイズ`
            : label}
        </span>
        {mounting && !clip.ready && (
          <span className="pr-1 text-[10px] text-muted-foreground">準備中</span>
        )}
        <button
          type="button"
          className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
          aria-label="この動画を閉じる"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => removeYoutubeClip(clip.id)}
        >
          ×
        </button>
      </div>
      <div
        className="relative bg-foreground/5"
        style={{ height: Math.max(80, box.h - YT_CHROME) }}
      >
        <div
          key={`${clip.videoId}-${clip.epoch}`}
          id={ytElementId(clip.id)}
          className="absolute inset-0 h-full w-full [&_iframe]:h-full [&_iframe]:w-full"
        />
        {clip.pinned && (
          <button
            type="button"
            data-yt-resize
            aria-label="サイズ変更"
            className="absolute right-0 bottom-0 z-10 h-5 w-5 cursor-nwse-resize touch-none"
            onPointerDown={onResizeDown}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeUp}
            onPointerCancel={onResizeUp}
          >
            <span className="absolute right-1 bottom-1 block h-2.5 w-2.5 border-r-2 border-b-2 border-primary" />
          </button>
        )}
      </div>
    </div>
  );
}
