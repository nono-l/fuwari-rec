import { useEffect, useRef, useState } from "react";
import { Mic2, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAudioEngine } from "@/lib/audio/engine";
import {
  centsBetween,
  detectPitch,
  hzToMidi,
  midiToHz,
  midiToNoteName,
} from "@/lib/audio/pitch";
import { useEditorStore } from "@/lib/store/editor-store";
import { cn } from "@/lib/utils";

const WINDOW_MS = 2000;
const CUE_MS = 220;
const HOLD_MS = 160;
const PERFECT = 25;
const GOOD = 50;
const CLOSE = 100;

const SCALE = [0, 2, 4, 5, 7, 9, 11, 12];

type Judge = "perfect" | "good" | "close" | "miss" | null;
type Pattern = "scale" | "random" | "repeat";

function cueTone(hz: number) {
  const ctx = getAudioEngine().getContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = hz;
  const t = ctx.currentTime;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.14, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + CUE_MS / 1000);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + CUE_MS / 1000 + 0.02);
}

function nextMidi(pattern: Pattern, step: number, root: number) {
  if (pattern === "random") {
    return root + SCALE[Math.floor(Math.random() * SCALE.length)]!;
  }
  if (pattern === "repeat") {
    return root + SCALE[Math.floor(step / 4) % SCALE.length]!;
  }
  return root + SCALE[step % SCALE.length]!;
}

export function VocalTrainPanel() {
  const inputEnabled = useEditorStore((s) => s.inputEnabled);
  const stopRangeTest = useEditorStore((s) => s.stopRangeTest);
  const [running, setRunning] = useState(false);
  const [octave, setOctave] = useState(4);
  const [pattern, setPattern] = useState<Pattern>("scale");
  const [target, setTarget] = useState("C4");
  const [heard, setHeard] = useState("—");
  const [cents, setCents] = useState<number | null>(null);
  const [left, setLeft] = useState(WINDOW_MS);
  const [judge, setJudge] = useState<Judge>(null);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [best, setBest] = useState(0);
  const [hits, setHits] = useState(0);
  const [tries, setTries] = useState(0);
  const [error, setError] = useState("");
  const stopRef = useRef(false);

  useEffect(() => {
    return () => {
      stopRef.current = true;
    };
  }, []);

  const start = async () => {
    setError("");
    if (!inputEnabled) {
      setError("入力がオフです。スタジオでマイクをオンにしてください");
      return;
    }
    try {
      stopRangeTest();
      const engine = getAudioEngine();
      await engine.startPitchTap();
      await engine.getContext().resume();
      stopRef.current = false;
      setRunning(true);
      setScore(0);
      setCombo(0);
      setHits(0);
      setTries(0);
      void run(engine);
    } catch (e) {
      setError(e instanceof Error ? e.message : "マイクを開始できませんでした");
      setRunning(false);
    }
  };

  const stop = () => {
    stopRef.current = true;
    setRunning(false);
    try {
      if (!useEditorStore.getState().rangeMeasuring) {
        getAudioEngine().stopPitchTap();
      }
    } catch {
      /* noop */
    }
  };

  async function run(engine: ReturnType<typeof getAudioEngine>) {
    let step = 0;
    let localCombo = 0;
    let localBest = 0;
    let localScore = 0;
    let localHits = 0;
    const root = 12 * (octave + 1);
    while (!stopRef.current) {
      const midi = nextMidi(pattern, step, root);
      const hz = midiToHz(midi);
      const name = midiToNoteName(midi);
      setTarget(name);
      setHeard("—");
      setCents(null);
      setJudge(null);
      setLeft(WINDOW_MS);
      cueTone(hz);
      const started = performance.now();
      let holdFrom = 0;
      let matched = false;
      let bestAbs = 999;
      while (!stopRef.current && performance.now() - started < WINDOW_MS) {
        const buf = engine.readPitchTimeDomain();
        const sr = engine.getSampleRate();
        const now = performance.now();
        setLeft(Math.max(0, WINDOW_MS - (now - started)));
        if (buf) {
          const det = detectPitch(buf, sr);
          if (det && det.confidence > 0.45) {
            const c = centsBetween(det.hz, hz);
            const abs = Math.abs(c);
            setHeard(midiToNoteName(hzToMidi(det.hz)));
            setCents(Math.round(c));
            if (abs < bestAbs) bestAbs = abs;
            if (abs <= GOOD) {
              if (!holdFrom) holdFrom = now;
              if (now - holdFrom >= HOLD_MS) matched = true;
            } else {
              holdFrom = 0;
            }
          }
        }
        await new Promise((r) => requestAnimationFrame(() => r(null)));
      }
      if (stopRef.current) break;
      const verdict: Judge =
        matched && bestAbs <= PERFECT
          ? "perfect"
          : matched
            ? "good"
            : bestAbs <= CLOSE
              ? "close"
              : "miss";
      const add = verdict === "perfect" ? 100 : verdict === "good" ? 70 : verdict === "close" ? 40 : 0;
      localCombo = add >= 70 ? localCombo + 1 : 0;
      localBest = Math.max(localBest, localCombo);
      localScore += add + (add >= 70 ? localCombo * 5 : 0);
      if (add >= 70) localHits += 1;
      setJudge(verdict);
      setCombo(localCombo);
      setBest(localBest);
      setScore(localScore);
      setHits(localHits);
      setTries(step + 1);
      step += 1;
      await new Promise((r) => setTimeout(r, 420));
    }
    setRunning(false);
  }

  const remain = left / WINDOW_MS;
  const label =
    judge === "perfect"
      ? "ぴったり"
      : judge === "good"
        ? "合ってる"
        : judge === "close"
          ? "惜しい"
          : judge === "miss"
            ? "外れ"
            : running
              ? "声で返して"
              : "スタートで開始";

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Mic2 className="size-5 text-primary" />
              指定音に声で合わせる
            </h2>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
              見本の音が鳴ったら、2秒以内に同じ高さで声を返します。リズムゲーの判定です。±25centでぴったり、±50centで合格。
            </p>
          </div>
          {!running ? (
            <Button type="button" disabled={!inputEnabled} onClick={() => void start()}>
              <Play className="size-4" />
              スタート
            </Button>
          ) : (
            <Button type="button" variant="danger" onClick={stop}>
              <Square className="size-4" />
              ストップ
            </Button>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-[12px]">
          <label className="flex items-center gap-1 text-muted-foreground">
            高さ
            <select
              className="rounded-md border border-border bg-background px-2 py-1 text-foreground"
              value={octave}
              disabled={running}
              onChange={(e) => setOctave(Number(e.target.value))}
            >
              <option value={3}>低め C3</option>
              <option value={4}>ふつう C4</option>
              <option value={5}>高め C5</option>
            </select>
          </label>
          {(
            [
              ["scale", "階段"],
              ["repeat", "同じ音×4"],
              ["random", "ランダム"],
            ] as const
          ).map(([id, name]) => (
            <button
              key={id}
              type="button"
              disabled={running}
              onClick={() => setPattern(id)}
              className={cn(
                "rounded-full border px-3 py-1",
                pattern === id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground",
              )}
            >
              {name}
            </button>
          ))}
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-[180px_1fr]">
          <div className="relative mx-auto grid size-40 place-items-center">
            <svg viewBox="0 0 100 100" className="absolute inset-0 size-full -rotate-90">
              <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" className="text-muted" strokeWidth="6" />
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="currentColor"
                className="text-primary"
                strokeWidth="6"
                strokeDasharray={`${Math.max(0, remain) * 264} 264`}
                strokeLinecap="round"
              />
            </svg>
            <div className="text-center">
              <div className="text-[11px] text-muted-foreground">お題</div>
              <div className="text-3xl font-semibold tabular-nums text-foreground">{target}</div>
              <div className="text-[11px] text-muted-foreground">2秒で声を返す</div>
            </div>
          </div>
          <div className="flex flex-col justify-center gap-2">
            <p
              className={cn(
                "text-2xl font-semibold",
                judge === "perfect" || judge === "good"
                  ? "text-primary"
                  : judge === "miss"
                    ? "text-danger"
                    : "text-foreground",
              )}
            >
              {label}
            </p>
            <p className="text-sm text-muted-foreground">
              今の声 {heard}
              {cents != null ? ` · ${cents > 0 ? "+" : ""}${cents} cent` : ""}
              {running ? ` · 残り ${(left / 1000).toFixed(1)}秒` : ""}
            </p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label="得点" value={String(score)} />
              <Stat label="コンボ" value={String(combo)} />
              <Stat label="命中" value={`${hits}/${tries}`} />
            </div>
            <p className="text-[11px] text-muted-foreground">最高コンボ {best}</p>
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background px-2 py-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}
