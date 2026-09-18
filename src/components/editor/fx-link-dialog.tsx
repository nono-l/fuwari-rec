import { useEffect, useState } from "react";
import { Copy, QrCode, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { encodeFxPayload, fxLinkUrl, qrImageUrl } from "@/lib/audio/fx-link";
import type { FxSnapshot } from "@/lib/audio/fx-snapshot";

export function FxLinkDialog({
  open,
  snap,
  onClose,
}: {
  open: boolean;
  snap: FxSnapshot;
  onClose: () => void;
}) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setBusy(true);
    setCopied(false);
    setError(null);
    void encodeFxPayload(snap)
      .then((payload) => {
        if (!live) return;
        setUrl(fxLinkUrl(payload));
        setBusy(false);
      })
      .catch(() => {
        if (!live) return;
        setError("リンクを作れませんでした");
        setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [open, snap]);

  if (!open) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setError("コピーできませんでした");
    }
  };

  const long = url.length > 1800;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-4 shadow-lg">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <QrCode className="size-4 text-primary" />
              プリセットリンク
            </h2>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
              この URL を開くと、同じエフェクトが一発でかかります
            </p>
          </div>
          <Button type="button" size="icon-sm" variant="ghost" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
        {busy ? (
          <p className="text-[12px] text-muted-foreground">作っています…</p>
        ) : error ? (
          <p className="text-[12px] text-danger">{error}</p>
        ) : (
          <>
            <input
              readOnly
              value={url}
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-[11px] text-foreground"
              onFocus={(e) => e.currentTarget.select()}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" onClick={() => void copy()}>
                <Copy className="size-3.5" />
                {copied ? "コピーした" : "コピー"}
              </Button>
              {long && (
                <span className="text-[10px] text-muted-foreground">
                  長いので QR は読めない端末があります。リンクを送ってください
                </span>
              )}
            </div>
            {!long && (
              <img
                src={qrImageUrl(url)}
                alt="プリセットのQR"
                width={220}
                height={220}
                className="mx-auto mt-3 rounded-xl border border-border bg-white p-2"
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
