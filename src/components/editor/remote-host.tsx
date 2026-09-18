import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { QrCode, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SCENES, type SceneId } from "@/lib/audio/scenes";
import { isSceneId, postRemoteRoom, remotePageUrl } from "@/lib/audio/remote-room";
import { qrImageUrl } from "@/lib/audio/fx-link";
import { useEditorStore } from "@/lib/store/editor-store";

export function RemoteHost() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [pad, setPad] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recall = useEditorStore((s) => s.recallScene);
  const scene = useEditorStore((s) => s.activeSceneId);
  const fromPad = useRef<SceneId | null>(null);

  useEffect(() => {
    if (!open && !code) return;
    let stop = false;
    const tick = async () => {
      try {
        const s = await postRemoteRoom({
          code: code ?? undefined,
          role: "host",
        });
        if (stop) return;
        setCode(s.code);
        setPad(s.pad);
        setError(null);
        if (isSceneId(s.scene) && s.scene !== useEditorStore.getState().activeSceneId) {
          fromPad.current = s.scene;
          recall(s.scene);
        }
      } catch (e) {
        if (!stop) setError(e instanceof Error ? e.message : "リモコン失敗");
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 1000);
    let worker: Worker | null = null;
    try {
      const blob = new Blob(
        ["setInterval(function(){postMessage(1)},1000)"],
        { type: "text/javascript" },
      );
      worker = new Worker(URL.createObjectURL(blob));
      worker.onmessage = () => {
        void tick();
      };
    } catch {
      /* no worker */
    }
    const vis = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", vis);
    return () => {
      stop = true;
      window.clearInterval(id);
      worker?.terminate();
      document.removeEventListener("visibilitychange", vis);
    };
  }, [open, code, recall]);

  useEffect(() => {
    if (!code) return;
    if (fromPad.current === scene) {
      fromPad.current = null;
      return;
    }
    void postRemoteRoom({ code, role: "host", scene }).catch(() => {});
  }, [code, scene]);

  const url = code ? remotePageUrl(code) : "";
  const stop = () => {
    setCode(null);
    setPad(false);
    setOpen(false);
  };

  const panel =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            className="w-[min(220px,calc(100vw-1.5rem))] rounded-2xl border border-border bg-card p-3 shadow-lg"
            style={{
              position: "fixed",
              top: "calc(var(--grok-banner-h, 0px) + 0.75rem)",
              right: "0.75rem",
              zIndex: 80,
            }}
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <h2 className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
                  <QrCode className="size-3.5 text-primary" />
                  スマホリモコン
                </h2>
                <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                  ページを動かしてもこのQRは画面に残ります
                </p>
              </div>
              <Button type="button" size="icon-sm" variant="ghost" onClick={() => setOpen(false)}>
                <X className="size-4" />
              </Button>
            </div>
            {error && <p className="text-[11px] text-danger">{error}</p>}
            {code ? (
              <>
                <p className="text-center text-xl font-semibold tracking-[0.28em] text-foreground">
                  {code}
                </p>
                <img
                  src={qrImageUrl(url)}
                  alt="リモコンのQR"
                  width={180}
                  height={180}
                  className="mx-auto mt-2 w-full rounded-xl border border-border bg-white p-1.5"
                />
                <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
                  {pad ? "スマホ接続中" : "QR を読んで待っています"}
                  {" · "}
                  いま {SCENES.find((s) => s.id === scene)?.label}
                </p>
                <p className="mt-2 break-all text-center text-[10px] text-muted-foreground">
                  {url}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="mt-2 w-full"
                  onClick={() => void navigator.clipboard.writeText(url)}
                >
                  リンクをコピー
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="mt-1 w-full text-[10px]"
                  onClick={stop}
                >
                  リモコンを切る
                </Button>
              </>
            ) : (
              <p className="text-[11px] text-muted-foreground">コードを発行しています…</p>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant={code ? "default" : "secondary"}
        onClick={() => setOpen(true)}
      >
        <Smartphone className="size-3.5" />
        {code ? (pad ? "リモコン接続中" : "リモコン待ち") : "リモコン"}
      </Button>
      {panel}
    </>
  );
}
