import { useEffect, useRef, useState } from "react";
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
    const id = window.setInterval(() => void tick(), 500);
    return () => {
      stop = true;
      window.clearInterval(id);
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
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-4 shadow-lg">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <QrCode className="size-4 text-primary" />
                  スマホリモコン
                </h2>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                  この PC のタブは開いたまま。スマホはシーン切替だけです
                </p>
              </div>
              <Button type="button" size="icon-sm" variant="ghost" onClick={() => setOpen(false)}>
                <X className="size-4" />
              </Button>
            </div>
            {error && <p className="text-[12px] text-danger">{error}</p>}
            {code ? (
              <>
                <p className="text-center text-3xl font-semibold tracking-[0.3em] text-foreground">
                  {code}
                </p>
                <img
                  src={qrImageUrl(url)}
                  alt="リモコンのQR"
                  width={220}
                  height={220}
                  className="mx-auto mt-3 rounded-xl border border-border bg-white p-2"
                />
                <p className="mt-2 text-center text-[11px] text-muted-foreground">
                  {pad ? "スマホ接続中" : "QR を読んで待っています"}
                  {" · "}
                  いま {SCENES.find((s) => s.id === scene)?.label}
                </p>
                <p className="mt-2 break-all text-center text-[10px] text-muted-foreground">{url}</p>
                <Button type="button" size="sm" variant="ghost" className="mt-2 w-full" onClick={stop}>
                  リモコンを切る
                </Button>
              </>
            ) : (
              <p className="text-[12px] text-muted-foreground">コードを発行しています…</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
