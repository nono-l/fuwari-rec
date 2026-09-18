type SpeechRec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((ev: SpeechResultEvent) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechResultEvent = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};

const MAX_QUEUE = 4;
const MAX_UTTER = 80;

let queue: string[] = [];
let interim = "";
let lines: string[] = [];

type Cap = { text: string; holdMs: number; startedAt: number };
let showing: Cap | null = null;
let capQ: Cap[] = [];

function readHold(text: string, audioMs = 0) {
  const chars = Math.max(1, [...text].length);
  const readMs = Math.max(4500, Math.min(16000, chars * 450));
  return Math.max(readMs, audioMs + 1800);
}

function pushCaption(text: string, audioMs = 0) {
  const holdMs = readHold(text, audioMs);
  if (showing?.text === text) {
    const elapsed = Date.now() - showing.startedAt;
    showing.holdMs = Math.max(showing.holdMs, elapsed + holdMs);
    return;
  }
  const found = capQ.find((c) => c.text === text);
  if (found) {
    found.holdMs = Math.max(found.holdMs, holdMs);
    return;
  }
  if (!showing) {
    showing = { text, holdMs, startedAt: Date.now() };
    return;
  }
  capQ.push({ text, holdMs, startedAt: 0 });
  if (capQ.length > 8) capQ.shift();
}

function advanceCaption() {
  const now = Date.now();
  while (showing && now - showing.startedAt >= showing.holdMs) {
    const n = capQ.shift();
    showing = n ? { ...n, startedAt: now } : null;
  }
}

function enqueue(raw: string) {
  const parts = raw
    .split(/[。．!?！？\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const part of parts) {
    for (let i = 0; i < part.length; i += MAX_UTTER) {
      const chunk = part.slice(i, i + MAX_UTTER).trim();
      if (chunk) {
        queue.push(chunk);
        pushCaption(chunk);
      }
    }
  }
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
}

export function lastSpokenText() {
  return queue[0] ?? "";
}

export function peekUtterance() {
  return queue[0] ?? "";
}

export function consumeUtterance(text: string, audioMs = 0) {
  if (!text) return;
  if (queue[0] === text) queue.shift();
  else {
    const i = queue.indexOf(text);
    if (i >= 0) queue.splice(i, 1);
  }
  pushCaption(text, audioMs);
}

export function overlayCaption() {
  advanceCaption();
  return {
    text: showing?.text || "",
    next: capQ[0]?.text || "",
    interim: showing ? "" : interim.length >= 4 ? interim : "",
  };
}

export function clearTranscript() {
  queue = [];
  interim = "";
  lines = [];
  showing = null;
  capQ = [];
}

export function speechRecognitionAvailable() {
  if (typeof window === "undefined") return false;
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export function startLiveTranscript(opts: {
  lang?: string;
  onUpdate: (next: { finalText: string; interim: string; error: string; queued: number }) => void;
}): { stop: () => void } {
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) {
    opts.onUpdate({
      finalText: "",
      interim: "",
      error: "このブラウザは文字起こしに対応していません（Chrome 向け）",
      queued: 0,
    });
    return { stop() {} };
  }
  const rec = new Ctor();
  rec.lang = opts.lang ?? "ja-JP";
  rec.continuous = true;
  rec.interimResults = true;
  let dead = false;
  const emit = (error = "") => {
    opts.onUpdate({
      finalText: lines.slice(-3).join("\n"),
      interim,
      error,
      queued: queue.length,
    });
  };
  rec.onresult = (ev) => {
    let nextInterim = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const row = ev.results[i];
      const t = (row[0]?.transcript ?? "").trim();
      if (!t) continue;
      if (row.isFinal) {
        enqueue(t);
        lines = [...lines, t].slice(-8);
        nextInterim = "";
      } else {
        nextInterim += t;
      }
    }
    interim = nextInterim;
    emit();
  };
  rec.onerror = (ev) => {
    const code = ev.error || "error";
    if (code === "no-speech" || code === "aborted") return;
    emit(
      code === "not-allowed"
        ? "マイクの許可が必要です"
        : `聞き取りエラー: ${code}`,
    );
  };
  rec.onend = () => {
    if (dead) return;
    try {
      rec.start();
    } catch {
      /* already started */
    }
  };
  try {
    rec.start();
  } catch (e) {
    emit(e instanceof Error ? e.message : "開始できませんでした");
  }
  return {
    stop() {
      dead = true;
      rec.onend = null;
      try {
        rec.stop();
      } catch {
        /* noop */
      }
    },
  };
}
