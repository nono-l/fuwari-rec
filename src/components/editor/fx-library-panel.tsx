import { useEffect, useState } from "react";
import { BookmarkPlus, FileCode2, FolderOpen, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEditorStore } from "@/lib/store/editor-store";
import {
  loadFxLibrary,
  removeFxPreset,
  saveFxLibrary,
  upsertFxPreset,
  type FxSnapshot,
} from "@/lib/audio/fx-snapshot";
import { FxXmlDialog } from "@/components/editor/fx-xml-dialog";

export function FxLibraryPanel() {
  const captureFxSnapshot = useEditorStore((s) => s.captureFxSnapshot);
  const applyFxSnapshot = useEditorStore((s) => s.applyFxSnapshot);
  const [name, setName] = useState("");
  const [library, setLibrary] = useState<FxSnapshot[]>([]);
  const [xmlOpen, setXmlOpen] = useState(false);
  const [exportSnap, setExportSnap] = useState<FxSnapshot | null>(null);

  useEffect(() => {
    setLibrary(loadFxLibrary());
  }, []);

  const persist = (next: FxSnapshot[]) => {
    setLibrary(next);
    saveFxLibrary(next);
  };

  const saveCurrent = () => {
    const snap = captureFxSnapshot(name.trim() || defaultName());
    persist(upsertFxPreset(snap, library));
    setName(snap.name);
    useEditorStore.setState({
      statusMessage: `エフェクト「${snap.name}」を保存しました`,
    });
  };

  const loadOne = (snap: FxSnapshot) => {
    applyFxSnapshot(snap);
    setName(snap.name);
  };

  const onImport = (presets: FxSnapshot[], applyFirst: boolean) => {
    let next = library;
    for (const p of presets) {
      next = upsertFxPreset(p, next);
    }
    persist(next);
    if (applyFirst && presets[0]) {
      applyFxSnapshot(presets[0]);
      setName(presets[0].name);
    }
  };

  const openXml = () => {
    setExportSnap(captureFxSnapshot(name.trim() || defaultName()));
    setXmlOpen(true);
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground sm:text-base">
            <BookmarkPlus className="size-4 text-primary" />
            エフェクト保存
          </h2>
          <p className="mt-1 text-[11px] text-muted-foreground sm:text-xs">
            MIX・スライダー・フィルター・部屋／声の記憶まで、今かけている一式を名前で残します。
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={openXml}
        >
          <FileCode2 className="size-3.5" />
          XML
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="名前（例: 深夜のハモリ）"
          className="h-10 flex-1 rounded-full border border-border bg-background px-4 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onKeyDown={(e) => {
            if (e.key === "Enter") saveCurrent();
          }}
        />
        <Button type="button" onClick={saveCurrent} className="shrink-0">
          <Save className="size-4" />
          {library.some((p) => p.name === (name.trim() || defaultName()))
            ? "上書き保存"
            : "保存"}
        </Button>
      </div>

      {library.length === 0 ? (
        <p className="mt-3 text-[11px] text-muted-foreground">
          まだありません。今の設定に名前をつけて保存するか、XML から読み込んでください。
        </p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {library.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-2.5 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium text-foreground">
                  {p.name}
                </div>
                <div className="truncate text-[10px] text-muted-foreground">
                  {p.filters.length} フィルター
                  {p.roomProfile ? " · 部屋" : ""}
                  {p.voiceProfile ? " · 声" : ""}
                  {" · "}
                  {formatSavedAt(p.savedAt)}
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => loadOne(p)}
              >
                <FolderOpen className="size-3.5" />
                読み出す
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label="削除"
                onClick={() => persist(removeFxPreset(p.id, library))}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {xmlOpen && exportSnap && (
        <FxXmlDialog
          open
          onClose={() => setXmlOpen(false)}
          current={exportSnap}
          library={library}
          onImport={onImport}
        />
      )}
    </section>
  );
}

function defaultName() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `設定 ${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatSavedAt(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
