import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { AiConvertState } from "@/lib/audio/ai-convert-runtime";
import {
  speechRecognitionAvailable,
  startLiveTranscript,
} from "@/lib/audio/live-transcript";

export function AiContentTranscript({ convert }: { convert: AiConvertState }) {
  const [on, setOn] = useState(false);
  const [finalText, setFinal] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const can = speechRecognitionAvailable();

  useEffect(() => {
    if (!on) return;
    const handle = startLiveTranscript({
      onUpdate: ({ finalText: f, interim: i, error: e }) => {
        setFinal(f);
        setInterim(i);
        setError(e);
      },
    });
    return () => handle.stop();
  }, [on]);

  const hasContent = convert.contentFrames > 0;

  return (
    <div className="space-y-2 rounded-lg border border-border bg-background px-2.5 py-2">
      <p className="text-[10px] text-muted-foreground">内容エンコーダ / 文字起こし</p>
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        HuBERT は文章ではなく特徴量です。Style-Bert-VITS2 の声モデルは、下の文字起こしの文章をその声で合成します。
      </p>
      <div className="rounded-md bg-muted/40 px-2 py-1.5 font-mono text-[12px] leading-none tracking-widest text-foreground">
        {hasContent ? convert.contentBars : "————————"}
      </div>
      <p className="text-[10px] tabular-nums text-muted-foreground">
        {hasContent
          ? `内容 ${convert.contentFrames}フレーム × ${convert.contentWidth}次元`
          : convert.hubertReady
            ? "内容はまだ取れていません。声を出して推論が走るとバーが動きます"
            : "内容エンコーダの .onnx が未設定です"}
      </p>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-foreground">文字起こし</span>
        <Button
          type="button"
          size="sm"
          variant={on ? "secondary" : "outline"}
          className="h-7 px-2 text-[11px]"
          disabled={!can}
          onClick={() => setOn((v) => !v)}
        >
          {on ? "停止" : "開始"}
        </Button>
      </div>
      {!can && (
        <p className="text-[10px] text-muted-foreground">
          Chrome など、音声認識のあるブラウザで使えます
        </p>
      )}
      {error && <p className="text-[11px] text-danger">{error}</p>}
      <p className="min-h-10 whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
        {finalText || (on ? "" : "開始すると、今の発話がここに出ます")}
        {interim ? (
          <span className="text-muted-foreground"> {interim}</span>
        ) : null}
      </p>
    </div>
  );
}
