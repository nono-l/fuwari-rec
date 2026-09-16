import { Plus } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/lib/store/editor-store";
import { useActivePipeline } from "@/lib/store/use-active-pipeline";
import {
  MAX_OBS_INSERTS,
  OBS_FILTER_CATALOG,
  recLabel,
  normalizeCompTune,
  normalizeLimiterTune,
  normalizeGateTune,
  type ObsFilterId,
  type ObsInsert,
  type RecMark,
} from "@/lib/audio/obs-filters";
import { CompTuneControls } from "@/components/editor/compressor-tune";
import { LimiterTuneControls } from "@/components/editor/limiter-tune";
import { GateTuneControls } from "@/components/editor/gate-tune";
import {
  bandEdges,
  formatHz,
  qFromBandWidthHz,
  bandWidthHz,
  clampFilterHz,
  SPEC_MIN_HZ,
  SPEC_MAX_HZ,
} from "@/lib/audio/spectrum-filters";
import { MAX_AI_VOICE } from "@/lib/audio/ai-voice";
import { MAX_CABLE_INSERTS } from "@/lib/audio/cables";
import { MAX_DEVICE_IO } from "@/lib/audio/device-io";

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function db(n: number) {
  const v = Math.round(n * 10) / 10;
  return `${v > 0 ? "+" : ""}${v} dB`;
}

export function insertSummary(ins: ObsInsert) {
  const band =
    ins.fullBand === false
      ? ` · ${formatHz(ins.hz ?? 1000)}`
      : " · 全帯域";
  if (ins.kind === "phase") return (ins.phaseInvert ? "反転 ON" : "OFF") + band;
  if (ins.kind === "eq3") {
    return `低 ${db(ins.eqLow)} · 中 ${db(ins.eqMid)} · 高 ${db(ins.eqHigh)}${band}`;
  }
  if (ins.kind === "howl") {
    return (ins.amount < 0.03 ? "オフ" : `自動 · ${pct(ins.amount)}`) + band;
  }
  if (ins.kind === "compressor") {
    const c = normalizeCompTune(ins.comp, ins.amount);
    return `${c.thresholdDb.toFixed(0)} dB · ${c.ratio.toFixed(1)}:1${band}`;
  }
  if (ins.kind === "limiter") {
    const l = normalizeLimiterTune(ins.limiter, ins.amount);
    return `${l.ceilingDb.toFixed(1)} dB · LA ${l.lookaheadMs.toFixed(1)}ms${band}`;
  }
  if (ins.kind === "gate") {
    const g = normalizeGateTune(ins.gate, ins.amount);
    return `${g.thresholdDb.toFixed(0)} dB · フロア ${pct(g.floor)}${band}`;
  }
  if (ins.kind === "gain") return pct(ins.amount) + band;
  return (ins.amount < 0.02 ? "オフ" : pct(ins.amount)) + band;
}

export function ObsFilterRack() {
  const pipe = useActivePipeline();
  const extras = useEditorStore((s) => s.extraPipelines);
  const mainAi = useEditorStore((s) => s.aiVoice);
  const inserts = pipe.obsInserts;
  const aiVoice = pipe.aiVoice;
  const cableInserts = pipe.cableInserts;
  const addObsInsert = useEditorStore((s) => s.addObsInsert);
  const addAiVoice = useEditorStore((s) => s.addAiVoice);
  const addCableInsert = useEditorStore((s) => s.addCableInsert);
  const addDeviceInsert = useEditorStore((s) => s.addDeviceInsert);
  const full = inserts.length >= MAX_OBS_INSERTS;
  const aiFull = Boolean(mainAi || extras.some((p) => p.aiVoice) || aiVoice);
  const cableFull = cableInserts.length >= MAX_CABLE_INSERTS;
  const deviceFull = pipe.deviceInserts.length >= MAX_DEVICE_IO;

  const insert = (kind: ObsFilterId) => {
    addObsInsert(kind);
  };

  return (
    <div className="flex flex-col gap-3">
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border bg-foreground px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold tracking-tight text-background sm:text-base">
            音声フィルターの種類
          </h2>
          <p className="mt-0.5 text-[11px] text-background/75 sm:text-xs">
            AIボイスは一段まで。仮想ケーブルでパイプライン2・3へ配線できます。ほかは何段でも置ける
          </p>
        </div>

        <div className="hidden grid-cols-[minmax(7.5rem,1fr)_4.5rem_minmax(0,1.4fr)_minmax(7.5rem,0.9fr)] gap-x-3 border-b border-border bg-muted/60 px-4 py-2 text-[11px] font-semibold text-muted-foreground sm:grid sm:px-5">
          <span>フィルター名</span>
          <span>おすすめ</span>
          <span>役割</span>
          <span>ライブへ</span>
        </div>

        <ul className="divide-y divide-border">
          <li className="px-3 py-3 sm:px-5 sm:py-3.5">
            <FilterRow
              name="AIボイス"
              rec="situational"
              role={`この段に来た音を声色変換へ渡す。設定は ${MAX_AI_VOICE} 段まで。上は前処理、下は変換後`}
              bar="#6d28d9"
              control={
                <div className="flex flex-col items-stretch gap-1 sm:items-end">
                  <Button
                    type="button"
                    size="sm"
                    variant={aiFull ? "secondary" : "default"}
                    disabled={aiFull}
                    onClick={() => addAiVoice()}
                    className="w-full"
                  >
                    <Plus className="size-3.5" />
                    {aiFull ? "一段挿入済み" : "ライブに挿入"}
                  </Button>
                  {aiFull && (
                    <span className="text-right text-[10px] tabular-nums text-muted-foreground">
                      {MAX_AI_VOICE}段まで
                    </span>
                  )}
                </div>
              }
            />
          </li>
          <li className="px-3 py-3 sm:px-5 sm:py-3.5">
            <FilterRow
              name="仮想ケーブルへ出力"
              rec="situational"
              role="この段の音を仮想ケーブルへ送る。分岐（チェーン続行）か送り切り。パイプライン2・3の入力になる"
              bar="#0f766e"
              control={
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={cableFull}
                  onClick={() => addCableInsert("out")}
                  className="w-full"
                >
                  <Plus className="size-3.5" />
                  ライブに挿入
                </Button>
              }
            />
          </li>
          <li className="px-3 py-3 sm:px-5 sm:py-3.5">
            <FilterRow
              name="仮想ケーブルから入力"
              rec="situational"
              role="パイプライン2・3の戻りを、この段で本体チェーンに混ぜる"
              bar="#115e59"
              control={
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={cableFull}
                  onClick={() => addCableInsert("in")}
                  className="w-full"
                >
                  <Plus className="size-3.5" />
                  ライブに挿入
                </Button>
              }
            />
          </li>
          <li className="px-3 py-3 sm:px-5 sm:py-3.5">
            <FilterRow
              name="マイクから入力"
              rec="situational"
              role="この段でマイク（別デバイスも可）をチェーンに混ぜる。パイプライン2以降の入口にも使える"
              bar="#0369a1"
              control={
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={deviceFull}
                  onClick={() => addDeviceInsert("mic-in")}
                  className="w-full"
                >
                  <Plus className="size-3.5" />
                  ライブに挿入
                </Button>
              }
            />
          </li>
          <li className="px-3 py-3 sm:px-5 sm:py-3.5">
            <FilterRow
              name="スピーカーへ出力"
              rec="situational"
              role="この段の音をスピーカーへ送る。分岐または送り切り。別デバイスも選べる"
              bar="#075985"
              control={
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={deviceFull}
                  onClick={() => addDeviceInsert("speaker-out")}
                  className="w-full"
                >
                  <Plus className="size-3.5" />
                  ライブに挿入
                </Button>
              }
            />
          </li>
          {OBS_FILTER_CATALOG.map((row) => {
            const count = inserts.filter((f) => f.kind === row.id).length;
            return (
              <li key={row.id} className="px-3 py-3 sm:px-5 sm:py-3.5">
                <FilterRow
                  name={row.name}
                  rec={row.rec}
                  role={row.role}
                  bar={row.bar}
                  control={
                    <div className="flex flex-col items-stretch gap-1 sm:items-end">
                      <Button
                        type="button"
                        size="sm"
                        variant={count ? "secondary" : "default"}
                        disabled={full}
                        onClick={() => insert(row.id)}
                        className="w-full"
                      >
                        <Plus className="size-3.5" />
                        {count === 0
                          ? "ライブに挿入"
                          : `${count + 1}段目を挿入`}
                      </Button>
                      {count > 0 && (
                        <span className="text-right text-[10px] tabular-nums text-muted-foreground">
                          {count}段 挿入中
                        </span>
                      )}
                    </div>
                  }
                />
              </li>
            );
          })}
        </ul>

        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border bg-muted/40 px-4 py-2.5 text-[10px] text-muted-foreground sm:px-5">
          <span>
            <span className="font-semibold text-primary">◎</span> おすすめ
          </span>
          <span>
            <span className="font-semibold text-success">○</span> 用途に応じて
          </span>
          <span>
            <span className="font-semibold">△</span> 基本不要・特殊用途
          </span>
          <span>ゲインは前段トリム＋後段メイクアップ、の2段が定番です</span>
        </div>
      </section>
    </div>
  );
}

function FilterRow({
  name,
  rec,
  role,
  bar,
  control,
}: {
  name: string;
  rec: RecMark;
  role: string;
  bar: string;
  control: React.ReactNode;
}) {
  const badge = recLabel(rec);
  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(7.5rem,1fr)_4.5rem_minmax(0,1.4fr)_minmax(7.5rem,0.9fr)] sm:items-center sm:gap-x-3">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="h-8 w-1 shrink-0 rounded-full"
          style={{ background: bar }}
          aria-hidden
        />
        <span className="text-sm font-semibold text-foreground">{name}</span>
      </div>
      <div className={cn("text-sm font-semibold", badge.className)} title={badge.text}>
        {badge.mark}
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground sm:text-xs">
        {role}
      </p>
      <div className="min-w-0">{control}</div>
    </div>
  );
}

export function InsertControl({
  insert,
  onPatch,
}: {
  insert: ObsInsert;
  onPatch: (p: Partial<ObsInsert>) => void;
}) {
  const body =
    insert.kind === "phase" ? (
      <Button
        type="button"
        size="sm"
        variant={insert.phaseInvert ? "default" : "secondary"}
        aria-pressed={insert.phaseInvert}
        onClick={() => onPatch({ phaseInvert: !insert.phaseInvert })}
        className="w-full"
      >
        {insert.phaseInvert ? "反転 ON" : "OFF"}
      </Button>
    ) : insert.kind === "eq3" ? (
      <div className="space-y-1.5">
        <EqMini
          label="低"
          value={insert.eqLow}
          onChange={(v) => onPatch({ eqLow: v })}
        />
        <EqMini
          label="中"
          value={insert.eqMid}
          onChange={(v) => onPatch({ eqMid: v })}
        />
        <EqMini
          label="高"
          value={insert.eqHigh}
          onChange={(v) => onPatch({ eqHigh: v })}
        />
      </div>
    ) : insert.kind === "gain" ? (
      <Amount
        valueLabel={pct(insert.amount)}
        min={0}
        max={150}
        value={Math.round(insert.amount * 100)}
        onChange={(v) => onPatch({ amount: v / 100 })}
      />
    ) : insert.kind === "howl" ? (
      <div>
        <Amount
          valueLabel={insert.amount < 0.03 ? "オフ" : pct(insert.amount)}
          min={0}
          max={100}
          value={Math.round(insert.amount * 100)}
          onChange={(v) => onPatch({ amount: v / 100 })}
        />
        <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
          持続するピークを自動で切る。効きを上げるとノッチが増えて鋭くなる
        </p>
      </div>
    ) : insert.kind === "compressor" ? (
      <CompTuneControls
        value={normalizeCompTune(insert.comp, insert.amount)}
        onChange={(comp) => onPatch({ comp, amount: comp.mix })}
      />
    ) : insert.kind === "limiter" ? (
      <LimiterTuneControls
        value={normalizeLimiterTune(insert.limiter, insert.amount)}
        onChange={(limiter) => onPatch({ limiter, amount: limiter.mix })}
      />
    ) : insert.kind === "gate" ? (
      <GateTuneControls
        value={normalizeGateTune(insert.gate, insert.amount)}
        onChange={(gate) => onPatch({ gate, amount: gate.mix })}
      />
    ) : (
      <Amount
        valueLabel={insert.amount < 0.02 ? "オフ" : pct(insert.amount)}
        min={0}
        max={100}
        value={Math.round(insert.amount * 100)}
        onChange={(v) => onPatch({ amount: v / 100 })}
      />
    );

  const full = insert.fullBand !== false;
  const hz = insert.hz ?? 1000;
  const q = insert.q ?? 1.4;
  const minW = Math.max(12, hz / 18);
  const maxW = Math.max(minW * 1.2, hz / 0.35);
  const bw = Math.max(minW, Math.min(maxW, bandWidthHz(hz, q)));
  const widthSlider = Math.round(
    ((Math.log(bw) - Math.log(minW)) / Math.log(maxW / minW)) * 1000,
  );

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-[12px] font-medium text-foreground">
        <input
          type="checkbox"
          checked={full}
          onChange={() => onPatch({ fullBand: !full })}
        />
        全帯域にかける
      </label>
      {!full && (
        <div className="space-y-2">
          <div>
            <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
              <span>周波数</span>
              <span className="tabular-nums text-foreground">{formatHz(hz)}</span>
            </div>
            <Slider
              min={0}
              max={1000}
              step={1}
              value={[
                Math.round(
                  (Math.log(clampFilterHz(hz) / SPEC_MIN_HZ) /
                    Math.log(SPEC_MAX_HZ / SPEC_MIN_HZ)) *
                    1000,
                ),
              ]}
              onValueChange={([v]) => {
                const t = Math.max(0, Math.min(1000, v ?? 0)) / 1000;
                onPatch({
                  hz: clampFilterHz(
                    SPEC_MIN_HZ * Math.pow(SPEC_MAX_HZ / SPEC_MIN_HZ, t),
                  ),
                });
              }}
            />
          </div>
          <div>
            <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
              <span>範囲の広さ</span>
              <span className="tabular-nums text-foreground">
                {(() => {
                  const e = bandEdges(hz, q);
                  return `${formatHz(e.bw)}（${formatHz(e.lo)}–${formatHz(e.hi)}）`;
                })()}
              </span>
            </div>
            <Slider
              min={0}
              max={1000}
              step={1}
              value={[Math.max(0, Math.min(1000, widthSlider))]}
              onValueChange={([v]) => {
                const u = Math.max(0, Math.min(1000, v ?? 0)) / 1000;
                const nextBw = minW * Math.pow(maxW / minW, u);
                onPatch({ q: qFromBandWidthHz(hz, nextBw) });
              }}
            />
          </div>
        </div>
      )}
      {body}
    </div>
  );
}

function Amount({
  valueLabel,
  min,
  max,
  value,
  onChange,
}: {
  valueLabel: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 text-right text-[10px] tabular-nums text-foreground">
        {valueLabel}
      </div>
      <Slider
        min={min}
        max={max}
        step={1}
        value={[value]}
        onValueChange={([v]) => onChange(v ?? 0)}
      />
    </div>
  );
}

function EqMini({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-4 shrink-0 text-[10px] text-muted-foreground">{label}</span>
      <Slider
        min={-12}
        max={12}
        step={0.5}
        value={[value]}
        onValueChange={([v]) => onChange(v ?? 0)}
        className="flex-1"
      />
      <span className="w-12 shrink-0 text-right text-[10px] tabular-nums text-foreground">
        {db(value)}
      </span>
    </div>
  );
}
