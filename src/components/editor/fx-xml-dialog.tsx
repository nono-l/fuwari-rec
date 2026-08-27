import { useEffect, useRef, useState } from "react";
import { Copy, Download, FolderOpen, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  downloadXml,
  fxBankToXml,
  fxSnapshotToXml,
  parseFxXml,
  safeFilename,
  type FxSnapshot,
} from "@/lib/audio/fx-snapshot";

export function FxXmlDialog({
  open,
  onClose,
  current,
  library,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  current: FxSnapshot;
  library: FxSnapshot[];
  onImport: (presets: FxSnapshot[], applyFirst: boolean) => void;
}) {
  const [tab, setTab] = useState<"export" | "import">("export");
  const [xml, setXml] = useState("");
  const [scope, setScope] = useState<"current" | "library">("current");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setMessage(null);
    setXml(
      scope === "library" ? fxBankToXml(library) : fxSnapshotToXml(current),
    );
  }, [open, scope, current, library]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const copyXml = async () => {
    try {
      await navigator.clipboard.writeText(xml);
      setMessage("クリップボードにコピーしました");
      setError(null);
    } catch {
      setError("コピーできませんでした");
    }
  };

  const exportFile = () => {
    const name =
      scope === "library"
        ? "fuwari-fx-bank"
        : safeFilename(current.name || "current");
    downloadXml(`${name}.xml`, xml);
    setMessage("XML をダウンロードしました");
  };

  const readFile = async (file: File) => {
    const text = await file.text();
    setXml(text);
    setTab("import");
    setMessage(`${file.name} を読み込みました`);
    setError(null);
  };

  const runImport = (applyFirst: boolean) => {
    try {
      const presets = parseFxXml(xml);
      onImport(presets, applyFirst);
      setError(null);
      setMessage(
        applyFirst
          ? `「${presets[0]?.name}」を適用し、${presets.length} 件をライブラリへ`
          : `${presets.length} 件をライブラリに追加しました`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
      setMessage(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-3 sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fx-xml-title"
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-lg"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 id="fx-xml-title" className="text-sm font-semibold text-foreground">
            エフェクト XML
          </h2>
          <Button type="button" size="icon-sm" variant="ghost" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        <div className="flex gap-1 border-b border-border px-3 pt-2">
          {(
            [
              ["export", "書き出し"],
              ["import", "読み込み"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-t-lg px-3 py-2 text-xs font-medium ${
                tab === id
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {tab === "export" && (
            <div className="space-y-3">
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                今かけているエフェクト一式、または保存済みリストを XML にします。
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setScope("current")}
                  className={`rounded-lg border px-3 py-2 text-left text-xs ${
                    scope === "current"
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  今の設定
                </button>
                <button
                  type="button"
                  onClick={() => setScope("library")}
                  className={`rounded-lg border px-3 py-2 text-left text-xs ${
                    scope === "library"
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  保存リスト全部（{library.length}）
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={exportFile}>
                  <Download className="size-3.5" />
                  ダウンロード
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => void copyXml()}>
                  <Copy className="size-3.5" />
                  コピー
                </Button>
              </div>
            </div>
          )}

          {tab === "import" && (
            <div className="space-y-3">
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Fuwari の fuwari-fx XML をファイルまたは貼り付けで読みます。
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".xml,application/xml,text/xml"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void readFile(file);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => fileRef.current?.click()}
              >
                <FolderOpen className="size-3.5" />
                ファイルを選ぶ
              </Button>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={() => runImport(true)}>
                  <Upload className="size-3.5" />
                  読み込んで適用
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => runImport(false)}
                >
                  ライブラリに追加だけ
                </Button>
              </div>
            </div>
          )}

          <label className="mt-3 block text-[11px] text-muted-foreground">
            XML
            <textarea
              value={xml}
              onChange={(e) => setXml(e.target.value)}
              spellCheck={false}
              className="mt-1 h-48 w-full resize-y rounded-xl border border-border bg-background px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>

          {message && (
            <p className="mt-2 text-[11px] text-primary">{message}</p>
          )}
          {error && <p className="mt-2 text-[11px] text-danger">{error}</p>}
        </div>
      </div>
    </div>
  );
}
