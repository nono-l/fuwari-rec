import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  MAX_SCENES,
  isBuiltinScene,
  sceneKeyIndex,
  type SceneId,
} from "@/lib/audio/scenes";
import { obsOverlayUrl } from "@/lib/audio/obs-overlay-bus";
import { RemoteHost } from "@/components/editor/remote-host";
import { useEditorStore } from "@/lib/store/editor-store";

export function SceneBar({ compact = false }: { compact?: boolean }) {
  const active = useEditorStore((s) => s.activeSceneId);
  const bank = useEditorStore((s) => s.sceneBank);
  const list = useEditorStore((s) => s.sceneList);
  const recall = useEditorStore((s) => s.recallScene);
  const capture = useEditorStore((s) => s.captureScene);
  const reset = useEditorStore((s) => s.resetScene);
  const addScene = useEditorStore((s) => s.addScene);
  const renameScene = useEditorStore((s) => s.renameScene);
  const removeScene = useEditorStore((s) => s.removeScene);
  const toggleRemote = useEditorStore((s) => s.toggleSceneRemote);
  const cloud = useEditorStore((s) => s.sceneCloud);
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState("");
  const [renameId, setRenameId] = useState<SceneId | null>(null);
  const [renameVal, setRenameVal] = useState("");

  const copyObs = async () => {
    try {
      await navigator.clipboard.writeText(obsOverlayUrl());
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  if (compact) {
    return (
      <div className="flex min-w-0 shrink-0 items-center gap-1 overflow-x-auto">
        {list.map((sc) => (
          <button
            key={sc.id}
            type="button"
            onClick={() => recall(sc.id)}
            className={cn(
              "shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold sm:px-2.5",
              active === sc.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:text-foreground",
            )}
            title={sc.label}
          >
            {sceneKeyIndex(list, sc.id)} {sc.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-muted/30 px-3 py-2.5">
      <div className="text-[12px] font-medium text-foreground">シーン</div>
      <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
        数字キーで切替。今のチェーンをプリセットとして足せます。リモコンに出すものだけスマホに出ます
        {cloud === "ok"
          ? "。ログイン中のアカウントに保存され、別の端末でも使えます"
          : cloud === "loading"
            ? "。アカウントから読み込み中…"
            : cloud === "error"
              ? "。アカウント保存に失敗。この端末には残っています"
              : "。ログインするとアカウントに連携します"}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {list.map((sc) => {
          const saved = Boolean(bank[sc.id]);
          const on = active === sc.id;
          const key = sceneKeyIndex(list, sc.id);
          return (
            <div key={sc.id} className="min-w-0">
              <button
                type="button"
                onClick={() => recall(sc.id)}
                className={cn(
                  "w-full rounded-lg border px-2 py-2 text-left transition-colors",
                  on
                    ? "border-primary bg-primary/10"
                    : "border-border bg-background hover:border-primary hover:bg-primary/5",
                )}
              >
                <span className="flex items-baseline justify-between gap-1">
                  <span className="truncate text-[13px] font-semibold text-foreground">
                    {sc.label}
                  </span>
                  {key && (
                    <span className="text-[10px] tabular-nums text-muted-foreground">{key}</span>
                  )}
                </span>
                <span className="mt-0.5 block text-[10px] leading-relaxed text-muted-foreground">
                  {saved ? "記憶した内容" : sc.hint || "まだ記憶していません"}
                </span>
              </button>
              <div className="mt-1 flex flex-wrap gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5 text-[10px]"
                  onClick={() => capture(sc.id)}
                >
                  記憶
                </Button>
                {saved && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1.5 text-[10px]"
                    onClick={() => reset(sc.id)}
                  >
                    初期
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className={cn(
                    "h-6 px-1.5 text-[10px]",
                    sc.remote ? "text-primary" : "text-muted-foreground",
                  )}
                  onClick={() => toggleRemote(sc.id)}
                >
                  {sc.remote ? "リモコン" : "リモコン外"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5 text-[10px]"
                  onClick={() => {
                    setRenameId(sc.id);
                    setRenameVal(sc.label);
                  }}
                >
                  名
                </Button>
                {!isBuiltinScene(sc.id) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1.5 text-[10px] text-danger"
                    onClick={() => removeScene(sc.id)}
                  >
                    削除
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {renameId && (
        <div className="mt-2 flex gap-2">
          <input
            value={renameVal}
            onChange={(e) => setRenameVal(e.target.value)}
            className="h-8 flex-1 rounded-lg border border-border bg-background px-2 text-[12px]"
            maxLength={24}
          />
          <Button
            type="button"
            size="sm"
            onClick={() => {
              renameScene(renameId, renameVal);
              setRenameId(null);
            }}
          >
            改名
          </Button>
        </div>
      )}
      <div className="mt-2 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="例: 弾き語り"
          maxLength={24}
          disabled={list.length >= MAX_SCENES}
          className="h-8 flex-1 rounded-lg border border-border bg-background px-2 text-[12px]"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              addScene(draft);
              setDraft("");
            }
          }}
        />
        <Button
          type="button"
          size="sm"
          disabled={list.length >= MAX_SCENES}
          onClick={() => {
            addScene(draft);
            setDraft("");
          }}
        >
          シーン追加
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <RemoteHost />
        <Button type="button" size="sm" variant="secondary" onClick={() => void copyObs()}>
          OBSソース
        </Button>
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          {copied
            ? "URL をコピーしました。OBS のブラウザソースに貼って、背景を透明に"
            : "エフェクト ON のこのタブを開いたまま、OBS のブラウザソースへ"}
        </p>
      </div>
    </div>
  );
}
