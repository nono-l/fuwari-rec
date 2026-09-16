import { useEffect, useRef, useState } from "react";
import { Activity, Check, ChevronDown, ChevronUp, Pencil, Trash2 } from "lucide-react";
import { getAudioEngine } from "@/lib/audio/engine";
import {
  FILTER_KINDS,
  MAX_SPECTRUM_FILTERS,
  SPEC_MIN_HZ,
  bandEdges,
  bandWidthHz,
  clampFilterHz,
  defaultFilterGain,
  defaultFilterName,
  defaultFilterQ,
  filterKindLabel,
  formatFilterAmount,
  formatHz,
  hzToSpecT,
  qFromBandWidthHz,
  specTToHz,
  usesBandWidth,
  usesGain,
  allowsBandToggle,
  amountSliderLabel,
  normalizeDelayTune,
  normalizeOffsetTune,
  normalizeReverbTune,
  type DelayTune,
  type OffsetTune,
  type ReverbTune,
  type SpectrumFilter,
  type SpectrumFilterKind,
} from "@/lib/audio/spectrum-filters";
import { assembleLiveFx } from "@/lib/audio/live-fx";
import { catalogMeta } from "@/lib/audio/obs-filters";
import { aiVoiceSummary } from "@/lib/audio/ai-voice";
import { AiVoiceControl } from "@/components/editor/ai-voice-controls";
import { CABLE_INDEXES, asCableIndex, cableSummary } from "@/lib/audio/cables";
import { deviceIoSummary } from "@/lib/audio/device-io";
import { InsertControl, insertSummary } from "@/components/editor/obs-filter-rack";
import { ReverbTuneControls } from "@/components/editor/reverb-tune";
import { DelayTuneControls } from "@/components/editor/delay-tune";
import { OffsetTuneControls } from "@/components/editor/offset-tune";
import { useEditorStore } from "@/lib/store/editor-store";
import { useActivePipeline } from "@/lib/store/use-active-pipeline";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

const LABELS = [100, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;
const PAD_X = 6;

const KIND_COLOR: Record<SpectrumFilterKind, string> = {
  "cut-above": "#0f766e",
  "cut-below": "#047857",
  notch: "#be123c",
  "keep-band": "#0d9488",
  peak: "#ca8a04",
  "band-reverb": "#7c3aed",
  "band-formant": "#c2410c",
  "band-pitch": "#1d4ed8",
  "band-delay": "#0891b2",
  "band-offset": "#4f46e5",
};

type Draft = {
  id: string | null;
  name: string;
  kind: SpectrumFilterKind;
  hz: number;
  q: number;
  gain: number;
  fullBand: boolean;
  reverb: ReverbTune;
  delay: DelayTune;
  offset: OffsetTune;
};

function hzFromPointer(
  clientX: number,
  rect: DOMRect,
  sampleRate: number,
) {
  const inner = Math.max(1, rect.width - PAD_X * 2);
  const x = Math.min(inner, Math.max(0, clientX - rect.left - PAD_X));
  return specTToHz(x / inner, sampleRate);
}

function logSliderFromHz(hz: number) {
  const t =
    Math.log(clampFilterHz(hz) / SPEC_MIN_HZ) /
    Math.log(16000 / SPEC_MIN_HZ);
  return Math.round(t * 1000);
}

function hzFromLogSlider(v: number) {
  return SPEC_MIN_HZ * Math.pow(16000 / SPEC_MIN_HZ, (v ?? 0) / 1000);
}

function qFromWidthSlider(hz: number, slider: number) {
  const minW = Math.max(12, hz / 18);
  const maxW = Math.max(minW * 1.2, hz / 0.35);
  const t = Math.max(0, Math.min(1, (slider ?? 0) / 1000));
  const bw = minW * Math.pow(maxW / minW, t);
  return qFromBandWidthHz(hz, bw);
}

function widthSliderFromQ(hz: number, q: number) {
  const minW = Math.max(12, hz / 18);
  const maxW = Math.max(minW * 1.2, hz / 0.35);
  const bw = Math.max(minW, Math.min(maxW, bandWidthHz(hz, q)));
  const t = Math.log(bw / minW) / Math.log(maxW / minW);
  return Math.round(Math.max(0, Math.min(1, t)) * 1000);
}

export function SpectrumAnalyzer({
  compact = false,
}: {
  compact?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const peakHzRef = useRef<HTMLSpanElement>(null);
  const pipe = useActivePipeline();
  const filters = pipe.spectrumFilters;
  const obsInserts = pipe.obsInserts;
  const aiVoice = pipe.aiVoice;
  const cableInserts = pipe.cableInserts;
  const deviceInserts = pipe.deviceInserts;
  const liveChain = pipe.liveChain;
  const liveItems = assembleLiveFx(
    liveChain,
    filters,
    obsInserts,
    aiVoice,
    cableInserts,
    deviceInserts,
  );
  const addSpectrumFilter = useEditorStore((s) => s.addSpectrumFilter);
  const updateSpectrumFilter = useEditorStore((s) => s.updateSpectrumFilter);
  const removeSpectrumFilter = useEditorStore((s) => s.removeSpectrumFilter);
  const toggleSpectrumFilter = useEditorStore((s) => s.toggleSpectrumFilter);
  const moveLiveSlot = useEditorStore((s) => s.moveLiveSlot);
  const updateObsInsert = useEditorStore((s) => s.updateObsInsert);
  const removeObsInsert = useEditorStore((s) => s.removeObsInsert);
  const toggleObsInsert = useEditorStore((s) => s.toggleObsInsert);
  const updateAiVoice = useEditorStore((s) => s.updateAiVoice);
  const removeAiVoice = useEditorStore((s) => s.removeAiVoice);
  const toggleAiVoice = useEditorStore((s) => s.toggleAiVoice);
  const updateCableInsert = useEditorStore((s) => s.updateCableInsert);
  const removeCableInsert = useEditorStore((s) => s.removeCableInsert);
  const toggleCableInsert = useEditorStore((s) => s.toggleCableInsert);
  const updateDeviceInsert = useEditorStore((s) => s.updateDeviceInsert);
  const removeDeviceInsert = useEditorStore((s) => s.removeDeviceInsert);
  const toggleDeviceInsert = useEditorStore((s) => s.toggleDeviceInsert);
  const inputDevices = useEditorStore((s) => s.inputDevices);
  const outputDevices = useEditorStore((s) => s.outputDevices);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const pipeIdRef = useRef(pipe.id);
  pipeIdRef.current = pipe.id;

  const [draft, setDraft] = useState<Draft | null>(null);
  const [obsEditId, setObsEditId] = useState<string | null>(null);
  const [hoverHz, setHoverHz] = useState<number | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const hoverRef = useRef(hoverHz);
  hoverRef.current = hoverHz;
  const dragging = useRef(false);
  const createdIdRef = useRef<string | null>(null);
  const snapshotRef = useRef<SpectrumFilter | null>(null);

  const applyLive = (next: Draft) => {
    if (!next.id) return;
    updateSpectrumFilter(next.id, {
      name:
        next.name.trim() ||
        defaultFilterName(next.kind, next.hz, next.fullBand),
      kind: next.kind,
      hz: next.hz,
      q: next.q,
      gain: next.gain,
      fullBand: next.fullBand,
      reverb: normalizeReverbTune(next.reverb),
      delay: normalizeDelayTune(next.delay),
      offset: normalizeOffsetTune(next.offset),
    });
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    let raf = 0;
    let bins = new Uint8Array(1024);
    let wave = new Uint8Array(2048);
    let peaks = new Float32Array(72);
    let map: { lo: number; hi: number }[] = [];
    let lastBarN = 0;
    let lastSr = 0;
    let lastW = 0;
    let sampleRate = 48000;

    const css = getComputedStyle(wrap);
    const primary = css.getPropertyValue("--color-primary").trim() || "#0f766e";
    const muted = css.getPropertyValue("--color-muted").trim() || "#e6f2ea";
    const border = css.getPropertyValue("--color-border").trim() || "#cfe3d6";
    const mutedFg =
      css.getPropertyValue("--color-muted-foreground").trim() || "#5a7163";
    const fg = css.getPropertyValue("--color-foreground").trim() || "#14231a";

    const rebuild = (sr: number, binCount: number, barN: number) => {
      const nyquist = sr / 2;
      const maxHz = Math.min(16000, nyquist * 0.9);
      const hzPer = nyquist / binCount;
      map = [];
      for (let i = 0; i < barN; i++) {
        const t0 = i / barN;
        const t1 = (i + 1) / barN;
        const f0 = SPEC_MIN_HZ * Math.pow(maxHz / SPEC_MIN_HZ, t0);
        const f1 = SPEC_MIN_HZ * Math.pow(maxHz / SPEC_MIN_HZ, t1);
        map.push({
          lo: Math.max(1, Math.floor(f0 / hzPer)),
          hi: Math.min(binCount - 1, Math.max(1, Math.ceil(f1 / hzPer))),
        });
      }
      if (peaks.length !== barN) peaks = new Float32Array(barN);
      lastBarN = barN;
      lastSr = sr;
    };

    const drawLine = (
      ctx: CanvasRenderingContext2D,
      hz: number,
      sr: number,
      padL: number,
      padT: number,
      innerW: number,
      innerH: number,
      color: string,
      label: string,
      shade: SpectrumFilterKind | "hover" | null,
      dpr: number,
      q = 1,
      gain = 0,
      fullBand = false,
    ) => {
      if (fullBand) {
        ctx.save();
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.1;
        ctx.fillRect(padL, padT, innerW, innerH);
        ctx.restore();
        return;
      }
      const t = hzToSpecT(hz, sr);
      const x = padL + t * innerW;
      ctx.save();
      if (shade === "cut-above") {
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.1;
        ctx.fillRect(x, padT, padL + innerW - x + 4, innerH);
      } else if (shade === "cut-below") {
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.1;
        ctx.fillRect(padL, padT, x - padL, innerH);
      } else if (
        shade === "notch" ||
        shade === "keep-band" ||
        shade === "peak" ||
        shade === "band-reverb" ||
        shade === "band-formant" ||
        shade === "band-pitch" ||
        shade === "band-delay" ||
        shade === "band-offset"
      ) {
        const { lo, hi } = bandEdges(hz, q);
        const x0 = padL + hzToSpecT(lo, sr) * innerW;
        const x1 = padL + hzToSpecT(hi, sr) * innerW;
        const peakColor =
          shade === "peak"
            ? gain < -0.15
              ? "#be123c"
              : gain > 0.15
                ? "#0f766e"
                : color
            : color;
        ctx.fillStyle = peakColor;
        ctx.globalAlpha =
          shade === "keep-band"
            ? 0.1
            : shade === "peak"
              ? 0.08 + Math.min(0.18, Math.abs(gain) / 80)
              : 0.16;
        if (shade === "keep-band") {
          ctx.fillRect(padL, padT, Math.max(0, x0 - padL), innerH);
          ctx.fillRect(x1, padT, padL + innerW - x1, innerH);
        } else {
          ctx.fillRect(x0, padT, Math.max(2 * dpr, x1 - x0), innerH);
        }
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = peakColor;
        ctx.lineWidth = dpr;
        ctx.setLineDash([3 * dpr, 3 * dpr]);
        ctx.beginPath();
        ctx.moveTo(x0, padT);
        ctx.lineTo(x0, padT + innerH);
        ctx.moveTo(x1, padT);
        ctx.lineTo(x1, padT + innerH);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, 1.25 * dpr);
      ctx.setLineDash(shade === "hover" ? [4 * dpr, 3 * dpr] : []);
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + innerH);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.font = `${9 * dpr}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textBaseline = "top";
      ctx.textAlign = t > 0.72 ? "right" : "left";
      ctx.fillText(label, t > 0.72 ? x - 3 * dpr : x + 3 * dpr, padT + 2 * dpr);
      ctx.restore();
    };

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cssW = wrap.clientWidth || 320;
      const cssH = wrap.clientHeight || 140;
      const w = Math.floor(cssW * dpr);
      const h = Math.floor(cssH * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        lastW = 0;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      let sr = 0;
      try {
        const engine = getAudioEngine();
        const binCount = engine.getSpectrumBinCount();
        if (bins.length !== binCount && binCount > 0) {
          bins = new Uint8Array(binCount);
        }
        sr = engine.fillSpectrum(bins, pipeIdRef.current);
        if (sr > 0) sampleRate = sr;
        const wn = engine.fillOutputWave(wave, pipeIdRef.current);
        if (wn > 0 && wave.length !== wn) {
          wave = new Uint8Array(wn);
          engine.fillOutputWave(wave);
        }
      } catch {
        sr = sampleRate;
      }

      const barN = Math.max(28, Math.min(64, Math.round(cssW / 8)));
      if (sr > 0 && (barN !== lastBarN || sr !== lastSr || cssW !== lastW)) {
        rebuild(sr, bins.length, barN);
        lastW = cssW;
      }

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = muted;
      ctx.globalAlpha = 0.45;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;

      const padL = PAD_X * dpr;
      const padR = PAD_X * dpr;
      const padT = 16 * dpr;
      const padB = 16 * dpr;
      const innerW = w - padL - padR;
      const innerH = h - padT - padB;
      const gap = Math.max(1, dpr);
      const barW = innerW / Math.max(1, barN);

      let peakBin = 0;
      let peakVal = 0;

      for (let i = 0; i < barN; i++) {
        const range = map[i];
        let mag = 0;
        if (range) {
          let acc = 0;
          let n = 0;
          for (let k = range.lo; k <= range.hi; k++) {
            acc += bins[k] ?? 0;
            n += 1;
          }
          mag = n ? acc / n / 255 : 0;
        }
        mag = Math.pow(mag, 0.72);
        const prev = peaks[i] ?? 0;
        peaks[i] = mag > prev ? mag : prev * 0.94;
        const bh = mag * innerH;
        const x = padL + i * barW;
        const y = padT + innerH - bh;
        const rw = Math.max(1, barW - gap);

        const g = ctx.createLinearGradient(0, padT + innerH, 0, padT);
        g.addColorStop(0, primary);
        g.addColorStop(1, "color-mix(in oklab, " + primary + " 55%, white)");
        ctx.fillStyle = g;
        ctx.beginPath();
        const rad = Math.min(rw / 2, 3 * dpr);
        ctx.roundRect(x, y, rw, bh, [rad, rad, 0, 0]);
        ctx.fill();

        const ph = (peaks[i] ?? 0) * innerH;
        ctx.fillStyle = primary;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(x, padT + innerH - ph - dpr, rw, Math.max(dpr, 1.2 * dpr));
        ctx.globalAlpha = 1;

        if (range && mag > peakVal) {
          peakVal = mag;
          peakBin = Math.round((range.lo + range.hi) / 2);
        }
      }

      // Output waveform (post-FX, just before sink)
      ctx.beginPath();
      ctx.strokeStyle = fg;
      ctx.globalAlpha = 0.38;
      ctx.lineWidth = Math.max(1, 1.15 * dpr);
      const wlen = wave.length || 1;
      for (let i = 0; i < wlen; i++) {
        const nx = padL + (i / (wlen - 1)) * innerW;
        const v = ((wave[i] ?? 128) - 128) / 128;
        const ny = padT + innerH * 0.5 - v * innerH * 0.42;
        if (i === 0) ctx.moveTo(nx, ny);
        else ctx.lineTo(nx, ny);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;

      const srDraw = lastSr || sampleRate;
      const d = draftRef.current;
      for (const f of filtersRef.current) {
        if (!f.enabled) continue;
        if (d && d.id === f.id) continue;
        drawLine(
          ctx,
          f.hz,
          srDraw,
          padL,
          padT,
          innerW,
          innerH,
          KIND_COLOR[f.kind],
          usesGain(f.kind)
            ? `${f.name} ${formatFilterAmount(f.kind, f.gain ?? 0)}`
            : f.name,
          f.kind,
          dpr,
          f.q,
          f.gain ?? 0,
          !!f.fullBand && allowsBandToggle(f.kind),
        );
      }
      if (d) {
        drawLine(
          ctx,
          d.hz,
          srDraw,
          padL,
          padT,
          innerW,
          innerH,
          KIND_COLOR[d.kind],
          usesGain(d.kind)
            ? `${d.name || formatHz(d.hz)} ${formatFilterAmount(d.kind, d.gain)}`
            : d.name || formatHz(d.hz),
          d.kind,
          dpr,
          d.q,
          d.gain,
          !!d.fullBand && allowsBandToggle(d.kind),
        );
      } else if (hoverRef.current != null) {
        drawLine(
          ctx,
          hoverRef.current,
          srDraw,
          padL,
          padT,
          innerW,
          innerH,
          mutedFg,
          formatHz(hoverRef.current),
          "hover",
          dpr,
        );
      }

      ctx.strokeStyle = border;
      ctx.lineWidth = dpr;
      ctx.beginPath();
      ctx.moveTo(padL, padT + innerH + 0.5);
      ctx.lineTo(padL + innerW, padT + innerH + 0.5);
      ctx.stroke();

      if (srDraw > 0) {
        const nyquist = srDraw / 2;
        const maxHz = Math.min(16000, nyquist * 0.9);
        ctx.fillStyle = mutedFg;
        ctx.font = `${10 * dpr}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textBaseline = "top";
        for (const hz of LABELS) {
          if (hz > maxHz) continue;
          const t = Math.log(hz / SPEC_MIN_HZ) / Math.log(maxHz / SPEC_MIN_HZ);
          if (t < 0.02 || t > 0.98) continue;
          const x = padL + t * innerW;
          ctx.textAlign = "center";
          ctx.fillText(
            hz >= 1000 ? `${hz / 1000}k` : `${hz}`,
            x,
            padT + innerH + 3 * dpr,
          );
        }
      }

      const label = peakHzRef.current;
      if (label) {
        if (sr > 0 && peakVal > 0.12) {
          const hz = (peakBin * sr) / 2 / Math.max(1, bins.length);
          label.textContent = `${Math.round(hz)} Hz`;
        } else {
          label.textContent = "—";
        }
      }
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    setDraft(null);
    setObsEditId(null);
    createdIdRef.current = null;
  }, [pipe.id]);

  const sampleRateNow = () => {
    try {
      return getAudioEngine().getSampleRate();
    } catch {
      return 48000;
    }
  };

  const pickNear = (hz: number, width: number) => {
    const sr = sampleRateNow();
    let best: SpectrumFilter | null = null;
    let bestPx = 14;
    for (const f of filtersRef.current) {
      if (f.fullBand && allowsBandToggle(f.kind)) continue;
      const px =
        Math.abs(hzToSpecT(f.hz, sr) - hzToSpecT(hz, sr)) * width;
      if (px < bestPx) {
        best = f;
        bestPx = px;
      }
    }
    return best;
  };

  const openNew = (hz: number) => {
    const kind: SpectrumFilterKind = "cut-above";
    const id = addSpectrumFilter(kind, hz);
    if (!id) return;
    createdIdRef.current = id;
    snapshotRef.current = null;
    const f = useEditorStore
      .getState()
      .spectrumFilters.find((x) => x.id === id);
    setDraft({
      id,
      name: f?.name ?? defaultFilterName(kind, hz),
      kind,
      hz: clampFilterHz(hz),
      q: f?.q ?? defaultFilterQ(kind),
      gain: f?.gain ?? defaultFilterGain(kind),
      fullBand: false,
      reverb: normalizeReverbTune(f?.reverb),
      delay: normalizeDelayTune(f?.delay),
      offset: normalizeOffsetTune(f?.offset),
    });
  };

  const openEdit = (f: SpectrumFilter) => {
    createdIdRef.current = null;
    snapshotRef.current = { ...f };
    setDraft({
      id: f.id,
      name: f.name,
      kind: f.kind,
      hz: f.hz,
      q: f.q,
      gain: f.gain ?? 0,
      fullBand: !!f.fullBand,
      reverb: normalizeReverbTune(f.reverb),
      delay: normalizeDelayTune(f.delay),
      offset: normalizeOffsetTune(f.offset),
    });
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    dragging.current = true;
    wrap.setPointerCapture(e.pointerId);
    const hz = hzFromPointer(e.clientX, wrap.getBoundingClientRect(), sampleRateNow());
    const near = pickNear(hz, wrap.clientWidth);
    if (near) openEdit(near);
    else openNew(hz);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const hz = hzFromPointer(e.clientX, wrap.getBoundingClientRect(), sampleRateNow());
    setHoverHz(hz);
    if (!dragging.current || !draftRef.current) return;
    const d0 = draftRef.current;
    if (d0.fullBand && allowsBandToggle(d0.kind)) return;
    const next: Draft = {
      ...d0,
      hz,
      name: createdIdRef.current
        ? defaultFilterName(d0.kind, hz, d0.fullBand)
        : d0.name,
    };
    setDraft(next);
    applyLive(next);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    try {
      wrapRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };

  const closeDraft = () => {
    createdIdRef.current = null;
    snapshotRef.current = null;
    setDraft(null);
  };

  const cancelDraft = () => {
    if (createdIdRef.current) {
      removeSpectrumFilter(createdIdRef.current);
    } else if (snapshotRef.current) {
      const s = snapshotRef.current;
      updateSpectrumFilter(s.id, {
        name: s.name,
        kind: s.kind,
        hz: s.hz,
        q: s.q,
        gain: s.gain ?? 0,
        fullBand: !!s.fullBand,
        reverb: normalizeReverbTune(s.reverb),
        delay: normalizeDelayTune(s.delay),
        offset: normalizeOffsetTune(s.offset),
      });
    }
    closeDraft();
  };

  const changeKind = (kind: SpectrumFilterKind) => {
    setDraft((d) => {
      if (!d) return d;
      const auto =
        !d.name ||
        d.name === defaultFilterName(d.kind, d.hz, d.fullBand);
      const next: Draft = {
        ...d,
        kind,
        q: defaultFilterQ(kind),
        gain: defaultFilterGain(kind),
        fullBand: allowsBandToggle(kind) ? d.fullBand : false,
        name: auto
          ? defaultFilterName(
              kind,
              d.hz,
              allowsBandToggle(kind) ? d.fullBand : false,
            )
          : d.name,
      };
      applyLive(next);
      return next;
    });
  };

  const patchDraft = (partial: Partial<Draft>) => {
    setDraft((d) => {
      if (!d) return d;
      const next = { ...d, ...partial };
      applyLive(next);
      return next;
    });
  };

  return (
    <div className="mt-4">
      <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Activity className="size-3.5 text-primary" />
          フィルター後スペクトラム
          <span className="font-normal text-muted-foreground">
            · {pipe.name}
          </span>
        </span>
        <span className="tabular-nums text-foreground">
          ピーク{" "}
          <span ref={peakHzRef} className="font-medium">
            —
          </span>
        </span>
      </div>
      <div
        ref={wrapRef}
        className={cn(
          "relative cursor-crosshair touch-none overflow-hidden rounded-xl border border-border bg-muted/50",
          compact ? "h-32" : "h-44 sm:h-48",
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => {
          if (!dragging.current) setHoverHz(null);
        }}
      >
        <canvas
          ref={canvasRef}
          className="block h-full w-full"
          aria-label="リアルタイムスペクトラム。タップして周波数フィルターを追加"
        />
        {liveItems.length === 0 && !draft && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-5">
            <p
              className={cn(
                "select-none text-center font-semibold leading-snug tracking-wide text-foreground/20",
                compact ? "text-sm sm:text-base" : "text-lg sm:text-xl",
              )}
            >
              ここをタップで
              <br />
              各種フィルターを追加できます
            </p>
          </div>
        )}
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
        縦線をタップして帯域フィルターを追加。仮想ケーブルでパイプライン2・3へ分岐できます。上が先。
      </p>

      {draft && (
        <div className="mt-3 rounded-xl border border-border bg-card p-3 shadow-sm">
          <div className="mb-2 text-xs font-semibold text-foreground">
            フィルターを編集（すぐ反映）
            <span className="ml-2 font-normal text-muted-foreground">
              {draft.fullBand && allowsBandToggle(draft.kind)
                ? "全帯域"
                : formatHz(draft.hz)}
            </span>
          </div>
          <label className="block text-[11px] text-muted-foreground">
            名前
            <input
              value={draft.name}
              onChange={(e) => patchDraft({ name: e.target.value })}
              className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {FILTER_KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => changeKind(k.id)}
                className={cn(
                  "rounded-lg border px-2 py-2 text-left text-[11px] leading-snug transition-colors",
                  draft.kind === k.id
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-muted/40 text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="block font-medium">{k.label}</span>
                <span className="opacity-70">{k.hint}</span>
              </button>
            ))}
          </div>
          {allowsBandToggle(draft.kind) && (
            <label className="mt-3 flex items-center gap-2 text-[12px] font-medium text-foreground">
              <input
                type="checkbox"
                checked={draft.fullBand}
                onChange={() => {
                  const fullBand = !draft.fullBand;
                  const auto =
                    !draft.name ||
                    draft.name ===
                      defaultFilterName(draft.kind, draft.hz, draft.fullBand);
                  patchDraft({
                    fullBand,
                    name: auto
                      ? defaultFilterName(draft.kind, draft.hz, fullBand)
                      : draft.name,
                  });
                }}
              />
              全帯域にかける
            </label>
          )}
          {!(allowsBandToggle(draft.kind) && draft.fullBand) && (
          <>
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
              <span>周波数</span>
              <span className="tabular-nums text-foreground">
                {formatHz(draft.hz)}
              </span>
            </div>
            <Slider
              min={0}
              max={1000}
              step={1}
              value={[logSliderFromHz(draft.hz)]}
              onValueChange={([v]) => {
                const hz = hzFromLogSlider(v ?? 0);
                patchDraft({
                  hz,
                  name: createdIdRef.current
                    ? defaultFilterName(draft.kind, hz, draft.fullBand)
                    : draft.name,
                });
              }}
            />
          </div>
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
              <span>
                {usesBandWidth(draft.kind, draft.fullBand) ? "範囲の広さ" : "鋭さ（Q）"}
              </span>
              <span className="tabular-nums text-foreground">
                {usesBandWidth(draft.kind, draft.fullBand)
                  ? (() => {
                      const { lo, hi, bw } = bandEdges(draft.hz, draft.q);
                      return `${formatHz(bw)}（${formatHz(lo)}–${formatHz(hi)}）`;
                    })()
                  : draft.q.toFixed(1)}
              </span>
            </div>
            {usesBandWidth(draft.kind, draft.fullBand) ? (
              <Slider
                min={0}
                max={1000}
                step={1}
                value={[widthSliderFromQ(draft.hz, draft.q)]}
                onValueChange={([v]) =>
                  patchDraft({ q: qFromWidthSlider(draft.hz, v ?? 0) })
                }
              />
            ) : (
              <Slider
                min={3}
                max={180}
                step={1}
                value={[Math.round(draft.q * 10)]}
                onValueChange={([v]) =>
                  patchDraft({ q: (v ?? 7) / 10 })
                }
              />
            )}
            {usesBandWidth(draft.kind, draft.fullBand) && (
              <p className="mt-1 text-[10px] text-muted-foreground">
                左が狭い（ピンポイント）、右が広い。点線が効く範囲です。
              </p>
            )}
          </div>
          </>
          )}
          {usesGain(draft.kind) && (
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
                <span>{amountSliderLabel(draft.kind)}</span>
                <span className="tabular-nums text-foreground">
                  {formatFilterAmount(draft.kind, draft.gain)}
                </span>
              </div>
              <Slider
                min={
                  draft.kind === "band-reverb" ||
                  draft.kind === "band-delay" ||
                  draft.kind === "band-offset"
                    ? 0
                    : draft.kind === "band-pitch"
                      ? -120
                      : -180
                }
                max={
                  draft.kind === "band-pitch" ? 120 : 180
                }
                step={1}
                value={[Math.round(draft.gain * 10)]}
                onValueChange={([v]) =>
                  patchDraft({ gain: (v ?? 0) / 10 })
                }
              />
              <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                <span>
                  {draft.kind === "band-reverb" || draft.kind === "band-delay"
                    ? "乾いた音"
                    : draft.kind === "band-offset"
                      ? "元のタイミング"
                      : draft.kind === "band-pitch"
                        ? "−12 半音"
                        : "−18 dB"}
                </span>
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() =>
                    patchDraft({ gain: defaultFilterGain(draft.kind) })
                  }
                >
                  初期値
                </button>
                <span>
                  {draft.kind === "band-reverb"
                    ? "残響だけ"
                    : draft.kind === "band-delay"
                      ? "ディレイだけ"
                      : draft.kind === "band-offset"
                        ? "ずらした音だけ"
                    : draft.kind === "band-pitch"
                      ? "＋12 半音"
                      : "＋18 dB"}
                </span>
              </div>
              {draft.kind === "band-reverb" && (
                <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                  乾いた音と残響の混ぜ。右に行くほど残響が大きくなります
                </p>
              )}
              {draft.kind === "band-delay" && (
                <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                  乾いた音とディレイの混ぜ。右に行くほど繰り返しが大きくなります
                </p>
              )}
              {draft.kind === "band-offset" && (
                <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                  右がいちばんわかりやすいです。混ぜると元のタイミングと重なってコームが付きます
                </p>
              )}
            </div>
          )}
          {draft.kind === "band-reverb" && (
            <ReverbTuneControls
              value={draft.reverb}
              onChange={(reverb) => patchDraft({ reverb })}
            />
          )}
          {draft.kind === "band-delay" && (
            <DelayTuneControls
              value={draft.delay}
              onChange={(delay) => patchDraft({ delay })}
            />
          )}
          {draft.kind === "band-offset" && (
            <OffsetTuneControls
              value={draft.offset}
              onChange={(offset) => patchDraft({ offset })}
            />
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={closeDraft}>
              <Check className="size-3.5" />
              完了
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={cancelDraft}
            >
              キャンセル
            </Button>
            {draft.id && (
              <Button
                type="button"
                size="sm"
                variant="danger"
                onClick={() => {
                  removeSpectrumFilter(draft.id!);
                  createdIdRef.current = null;
                  snapshotRef.current = null;
                  setDraft(null);
                }}
              >
                <Trash2 className="size-3.5" />
                削除
              </Button>
            )}
          </div>
        </div>
      )}

      {liveItems.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {liveItems.map((item, i) => {
            if (item.family === "spectrum") {
              const f = item.filter;
              return (
                <li
                  key={f.id}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border border-border bg-card px-2.5 py-2",
                    !f.enabled && "opacity-55",
                  )}
                >
                  <div className="flex shrink-0 flex-col">
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      disabled={i === 0}
                      onClick={() => moveLiveSlot(f.id, -1)}
                      aria-label="上へ（先にかける）"
                    >
                      <ChevronUp className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      disabled={i === liveItems.length - 1}
                      onClick={() => moveLiveSlot(f.id, 1)}
                      aria-label="下へ（後にかける）"
                    >
                      <ChevronDown className="size-3.5" />
                    </Button>
                  </div>
                  <span className="w-4 shrink-0 text-center text-[10px] tabular-nums text-muted-foreground">
                    {i + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleSpectrumFilter(f.id)}
                    className={cn(
                      "size-2.5 shrink-0 rounded-full",
                      f.enabled ? "bg-primary" : "bg-muted-foreground/40",
                    )}
                    aria-label={f.enabled ? "オフにする" : "オンにする"}
                    style={f.enabled ? { backgroundColor: KIND_COLOR[f.kind] } : undefined}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-foreground">
                      {f.name}
                    </div>
                    <div className="truncate text-[10px] text-muted-foreground">
                      {filterKindLabel(f.kind)}
                      {f.fullBand && allowsBandToggle(f.kind)
                        ? " · 全帯域"
                        : ` · ${formatHz(f.hz)}`}
                      {usesBandWidth(f.kind, !!f.fullBand)
                        ? ` · 幅 ${formatHz(bandWidthHz(f.hz, f.q))}`
                        : ""}
                      {usesGain(f.kind)
                        ? ` · ${formatFilterAmount(f.kind, f.gain ?? 0)}`
                        : ""}
                      {f.kind === "band-reverb"
                        ? ` · ${normalizeReverbTune(f.reverb).decay.toFixed(1)}秒`
                        : ""}
                      {f.kind === "band-delay"
                        ? ` · ${Math.round(normalizeDelayTune(f.delay).timeMs)}ms`
                        : ""}
                      {f.kind === "band-offset"
                        ? ` · ${Math.round(normalizeOffsetTune(f.offset).timeMs)}msずらす`
                        : ""}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => openEdit(f)}
                    aria-label="編集"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => {
                      if (draft?.id === f.id) setDraft(null);
                      removeSpectrumFilter(f.id);
                    }}
                    aria-label="削除"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              );
            }
            if (item.family === "ai") {
              const v = item.voice;
              const selected = obsEditId === v.id;
              return (
                <li
                  key={v.id}
                  className={cn(
                    "rounded-xl border border-border bg-card px-2.5 py-2",
                    selected && "ring-1 ring-primary/40",
                    !v.enabled && "opacity-55",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className="flex shrink-0 flex-col">
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        disabled={i === 0}
                        onClick={() => moveLiveSlot(v.id, -1)}
                        aria-label="上へ（先にかける）"
                      >
                        <ChevronUp className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        disabled={i === liveItems.length - 1}
                        onClick={() => moveLiveSlot(v.id, 1)}
                        aria-label="下へ（後にかける）"
                      >
                        <ChevronDown className="size-3.5" />
                      </Button>
                    </div>
                    <span className="w-4 shrink-0 text-center text-[10px] tabular-nums text-muted-foreground">
                      {i + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleAiVoice()}
                      className={cn(
                        "size-2.5 shrink-0 rounded-full",
                        v.enabled ? "bg-primary" : "bg-muted-foreground/40",
                      )}
                      aria-label={v.enabled ? "オフにする" : "オンにする"}
                      style={
                        v.enabled ? { backgroundColor: "#6d28d9" } : undefined
                      }
                    />
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() =>
                        setObsEditId((id) => (id === v.id ? null : v.id))
                      }
                    >
                      <div className="truncate text-xs font-medium text-foreground">
                        {v.name}
                      </div>
                      <div className="truncate text-[10px] text-muted-foreground">
                        {aiVoiceSummary(v)}
                      </div>
                    </button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => {
                        if (obsEditId === v.id) setObsEditId(null);
                        removeAiVoice();
                      }}
                      aria-label="削除"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                  {selected && (
                    <div className="mt-2 pl-11 pr-1">
                      <AiVoiceControl
                        voice={v}
                        onPatch={(p) => updateAiVoice(p)}
                      />
                    </div>
                  )}
                </li>
              );
            }
            if (item.family === "cable") {
              const c = item.cable;
              const selected = obsEditId === c.id;
              return (
                <li
                  key={c.id}
                  className={cn(
                    "rounded-xl border border-border bg-card px-2.5 py-2",
                    selected && "ring-1 ring-primary/40",
                    !c.enabled && "opacity-55",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className="flex shrink-0 flex-col">
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        disabled={i === 0}
                        onClick={() => moveLiveSlot(c.id, -1)}
                        aria-label="上へ"
                      >
                        <ChevronUp className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        disabled={i === liveItems.length - 1}
                        onClick={() => moveLiveSlot(c.id, 1)}
                        aria-label="下へ"
                      >
                        <ChevronDown className="size-3.5" />
                      </Button>
                    </div>
                    <span className="w-4 shrink-0 text-center text-[10px] tabular-nums text-muted-foreground">
                      {i + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleCableInsert(c.id)}
                      className={cn(
                        "size-2.5 shrink-0 rounded-full",
                        c.enabled ? "bg-primary" : "bg-muted-foreground/40",
                      )}
                      style={
                        c.enabled ? { backgroundColor: "#0f766e" } : undefined
                      }
                      aria-label={c.enabled ? "オフにする" : "オンにする"}
                    />
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() =>
                        setObsEditId((id) => (id === c.id ? null : c.id))
                      }
                    >
                      <div className="truncate text-xs font-medium text-foreground">
                        {c.name}
                      </div>
                      <div className="truncate text-[10px] text-muted-foreground">
                        {cableSummary(c)}
                      </div>
                    </button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => {
                        if (obsEditId === c.id) setObsEditId(null);
                        removeCableInsert(c.id);
                      }}
                      aria-label="削除"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                  {selected && (
                    <div className="mt-2 space-y-2 pl-11 pr-1">
                      <label className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        ケーブル
                        <select
                          className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
                          value={c.cable}
                          onChange={(e) =>
                            updateCableInsert(c.id, {
                              cable: asCableIndex(e.target.value),
                            })
                          }
                        >
                          {CABLE_INDEXES.map((n) => (
                            <option key={n} value={n}>
                              仮想ケーブル{n}
                            </option>
                          ))}
                        </select>
                      </label>
                      {c.kind === "out" ? (
                        <label className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                          送り方
                          <select
                            className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
                            value={c.mode}
                            onChange={(e) =>
                              updateCableInsert(c.id, {
                                mode: e.target.value as "split" | "send",
                              })
                            }
                          >
                            <option value="split">分岐（本体は続行）</option>
                            <option value="send">送り切り（本体は無音）</option>
                          </select>
                        </label>
                      ) : (
                        <div>
                          <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
                            <span>戻りの混ぜ</span>
                            <span className="tabular-nums text-foreground">
                              {Math.round(c.mix * 100)}%
                            </span>
                          </div>
                          <Slider
                            min={0}
                            max={100}
                            step={1}
                            value={[Math.round(c.mix * 100)]}
                            onValueChange={([n]) =>
                              updateCableInsert(c.id, { mix: (n ?? 100) / 100 })
                            }
                          />
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            }
            if (item.family === "device") {
              const d = item.io;
              const selected = obsEditId === d.id;
              const list =
                d.kind === "mic-in" ? inputDevices : outputDevices;
              return (
                <li
                  key={d.id}
                  className={cn(
                    "rounded-xl border border-border bg-card px-2.5 py-2",
                    selected && "ring-1 ring-primary/40",
                    !d.enabled && "opacity-55",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className="flex shrink-0 flex-col">
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        disabled={i === 0}
                        onClick={() => moveLiveSlot(d.id, -1)}
                        aria-label="上へ"
                      >
                        <ChevronUp className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        disabled={i === liveItems.length - 1}
                        onClick={() => moveLiveSlot(d.id, 1)}
                        aria-label="下へ"
                      >
                        <ChevronDown className="size-3.5" />
                      </Button>
                    </div>
                    <span className="w-4 shrink-0 text-center text-[10px] tabular-nums text-muted-foreground">
                      {i + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleDeviceInsert(d.id)}
                      className={cn(
                        "size-2.5 shrink-0 rounded-full",
                        d.enabled ? "bg-primary" : "bg-muted-foreground/40",
                      )}
                      style={
                        d.enabled ? { backgroundColor: "#0369a1" } : undefined
                      }
                      aria-label={d.enabled ? "オフにする" : "オンにする"}
                    />
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() =>
                        setObsEditId((id) => (id === d.id ? null : d.id))
                      }
                    >
                      <div className="truncate text-xs font-medium text-foreground">
                        {d.name}
                      </div>
                      <div className="truncate text-[10px] text-muted-foreground">
                        {deviceIoSummary(d)}
                      </div>
                    </button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => {
                        if (obsEditId === d.id) setObsEditId(null);
                        removeDeviceInsert(d.id);
                      }}
                      aria-label="削除"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                  {selected && (
                    <div className="mt-2 space-y-2 pl-11 pr-1">
                      <label className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        デバイス
                        <select
                          className="max-w-[14rem] rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
                          value={d.deviceId}
                          onChange={(e) => {
                            const id = e.target.value;
                            const label =
                              list.find((x) => x.deviceId === id)?.label ?? "";
                            updateDeviceInsert(d.id, {
                              deviceId: id,
                              deviceLabel: label,
                            });
                          }}
                        >
                          <option value="">既定</option>
                          {list.map((dev) => (
                            <option key={dev.deviceId} value={dev.deviceId}>
                              {dev.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      {d.kind === "speaker-out" && (
                        <label className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                          送り方
                          <select
                            className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
                            value={d.mode}
                            onChange={(e) =>
                              updateDeviceInsert(d.id, {
                                mode: e.target.value as "split" | "send",
                              })
                            }
                          >
                            <option value="split">分岐（本体は続行）</option>
                            <option value="send">送り切り（本体は無音）</option>
                          </select>
                        </label>
                      )}
                      <div>
                        <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
                          <span>{d.kind === "mic-in" ? "混ぜ" : "送り量"}</span>
                          <span className="tabular-nums text-foreground">
                            {Math.round(d.mix * 100)}%
                          </span>
                        </div>
                        <Slider
                          min={0}
                          max={100}
                          step={1}
                          value={[Math.round(d.mix * 100)]}
                          onValueChange={([n]) =>
                            updateDeviceInsert(d.id, { mix: (n ?? 100) / 100 })
                          }
                        />
                      </div>
                    </div>
                  )}
                </li>
              );
            }
            const ins = item.insert;
            const meta = catalogMeta(ins.kind);
            const selected = obsEditId === ins.id;
            return (
              <li
                key={ins.id}
                className={cn(
                  "rounded-xl border border-border bg-card px-2.5 py-2",
                  selected && "ring-1 ring-primary/40",
                  !ins.enabled && "opacity-55",
                )}
              >
                <div className="flex items-center gap-2">
                  <div className="flex shrink-0 flex-col">
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      disabled={i === 0}
                      onClick={() => moveLiveSlot(ins.id, -1)}
                      aria-label="上へ（先にかける）"
                    >
                      <ChevronUp className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      disabled={i === liveItems.length - 1}
                      onClick={() => moveLiveSlot(ins.id, 1)}
                      aria-label="下へ（後にかける）"
                    >
                      <ChevronDown className="size-3.5" />
                    </Button>
                  </div>
                  <span className="w-4 shrink-0 text-center text-[10px] tabular-nums text-muted-foreground">
                    {i + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleObsInsert(ins.id)}
                    className={cn(
                      "size-2.5 shrink-0 rounded-full",
                      ins.enabled ? "bg-primary" : "bg-muted-foreground/40",
                    )}
                    aria-label={ins.enabled ? "オフにする" : "オンにする"}
                    style={
                      ins.enabled && meta
                        ? { backgroundColor: meta.bar }
                        : undefined
                    }
                  />
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() =>
                      setObsEditId((id) => (id === ins.id ? null : ins.id))
                    }
                  >
                    <div className="truncate text-xs font-medium text-foreground">
                      {ins.name}
                    </div>
                    <div className="truncate text-[10px] text-muted-foreground">
                      {selected ? meta?.role : insertSummary(ins)}
                    </div>
                  </button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => {
                      if (obsEditId === ins.id) setObsEditId(null);
                      removeObsInsert(ins.id);
                    }}
                    aria-label="削除"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
                {selected && (
                  <div className="mt-2 pl-11 pr-1">
                    <InsertControl
                      insert={ins}
                      onPatch={(patch) => updateObsInsert(ins.id, patch)}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {filters.length >= MAX_SPECTRUM_FILTERS && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          帯域フィルターは {MAX_SPECTRUM_FILTERS} 段までです。不要なものを消してから追加してください。
        </p>
      )}
    </div>
  );
}
