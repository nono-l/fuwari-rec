import { useEffect, useState } from "react";
import { SCENES, type SceneId } from "@/lib/audio/scenes";
import { isSceneId, postRemoteRoom } from "@/lib/audio/remote-room";
import { cn } from "@/lib/utils";

export function RemotePad({ code }: { code: string }) {
  const [scene, setScene] = useState<SceneId>("talk");
  const [host, setHost] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<SceneId | null>(null);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const s = await postRemoteRoom({ code, role: "pad" });
        if (stop) return;
        setHost(s.host);
        if (isSceneId(s.scene)) setScene(s.scene);
        setError(null);
      } catch (e) {
        if (!stop) setError(e instanceof Error ? e.message : "繋がっていません");
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 1200);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [code]);

  const tap = async (id: SceneId) => {
    setBusy(id);
    try {
      const s = await postRemoteRoom({ code, role: "pad", scene: id });
      setScene(s.scene);
      setHost(s.host);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "送れませんでした");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 py-6">
      <div>
        <p className="text-[11px] tracking-widest text-muted-foreground">FUWARI REC リモコン</p>
        <h1 className="text-2xl font-semibold text-foreground">シーン切替</h1>
        <p className="mt-1 text-[12px] text-muted-foreground">
          コード {code}
          {host ? " · PC 接続中" : " · PC 待ち"}
        </p>
      </div>
        {error && (
          <div className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-[12px] text-danger">
            {error}
            <button
              type="button"
              className="ml-2 underline"
              onClick={() => void postRemoteRoom({ code, role: "pad" }).then((s) => {
                setHost(s.host);
                setError(null);
              }).catch((e) => setError(e instanceof Error ? e.message : "繋がっていません"))}
            >
              再試行
            </button>
          </div>
        )}
      <div className="grid gap-3">
        {SCENES.map((sc) => (
          <button
            key={sc.id}
            type="button"
            onClick={() => void tap(sc.id)}
            disabled={busy !== null}
            className={cn(
              "min-h-24 rounded-2xl border px-4 py-5 text-left transition-colors",
              scene === sc.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground active:bg-muted",
            )}
          >
            <span className="block text-2xl font-semibold">{sc.label}</span>
            <span className="mt-1 block text-[12px] opacity-80">キー {sc.key}</span>
          </button>
        ))}
      </div>
      <p className="mt-auto text-[11px] leading-relaxed text-muted-foreground">
        音声は PC 側のタブで処理します。この画面は切替だけです。コードが違うときは{" "}
        <a href="/remote" className="font-medium text-primary underline">
          入力し直す
        </a>
      </p>
    </div>
  );
}
