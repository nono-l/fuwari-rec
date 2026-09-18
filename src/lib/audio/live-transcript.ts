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
  onUpdate: (next: { finalText: string; interim: string; error: string }) => void;
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
    });
    return { stop() {} };
  }
  const rec = new Ctor();
  rec.lang = opts.lang ?? "ja-JP";
  rec.continuous = true;
  rec.interimResults = true;
  let finals = "";
  let dead = false;
  rec.onresult = (ev) => {
    let interim = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const row = ev.results[i];
      const t = row[0]?.transcript ?? "";
      if (row.isFinal) {
        finals = `${finals}${t}`.slice(-400);
      } else {
        interim += t;
      }
    }
    opts.onUpdate({ finalText: finals.trim(), interim: interim.trim(), error: "" });
  };
  rec.onerror = (ev) => {
    const code = ev.error || "error";
    if (code === "no-speech" || code === "aborted") return;
    opts.onUpdate({
      finalText: finals.trim(),
      interim: "",
      error:
        code === "not-allowed"
          ? "マイクの許可が必要です"
          : `聞き取りエラー: ${code}`,
    });
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
    opts.onUpdate({
      finalText: "",
      interim: "",
      error: e instanceof Error ? e.message : "開始できませんでした",
    });
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
