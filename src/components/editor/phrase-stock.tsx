import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { queuePhrase } from "@/lib/audio/live-transcript";

const KEY = "fuwari-phrase-stock";

type Phrase = { id: string; text: string };

function load(): Phrase[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as Phrase[]) : [];
    return Array.isArray(list) ? list.filter((p) => p && typeof p.text === "string") : [];
  } catch {
    return [];
  }
}

export function PhraseStock({ latest }: { latest: string }) {
  const [items, setItems] = useState<Phrase[]>([]);
  const [draft, setDraft] = useState("");
  const [hint, setHint] = useState("");

  useEffect(() => {
    setItems(load());
  }, []);

  const save = (next: Phrase[]) => {
    setItems(next);
    localStorage.setItem(KEY, JSON.stringify(next.slice(0, 24)));
  };

  const add = (text: string) => {
    const t = text.trim().slice(0, 80);
    if (!t) return;
    if (items.some((p) => p.text === t)) {
      setHint("すでにあります");
      return;
    }
    save([{ id: `${Date.now()}`, text: t }, ...items].slice(0, 24));
    setDraft("");
    setHint("");
  };

  const speak = (text: string) => {
    queuePhrase(text);
    setHint(`「${text}」を字幕と合成に積みました`);
  };

  const lastLine = latest
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .at(-1);

  return (
    <div className="space-y-2 rounded-lg border border-border bg-background px-2.5 py-2">
      <p className="text-[10px] text-muted-foreground">セリフストック</p>
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        挨拶やお礼を残して、タップで同じ文を字幕と声に出します。マイクで言い直さなくて大丈夫です。
      </p>
      <div className="flex gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add(draft);
          }}
          placeholder="例: 見てくれてありがとう"
          className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-[12px] text-foreground"
        />
        <Button type="button" size="sm" className="h-8 px-2 text-[11px]" onClick={() => add(draft)}>
          追加
        </Button>
      </div>
      {lastLine && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 w-full justify-start px-2 text-[11px]"
          onClick={() => add(lastLine)}
        >
          今の文を保存
        </Button>
      )}
      <ul className="space-y-1">
        {items.map((p) => (
          <li key={p.id} className="flex items-center gap-1">
            <button
              type="button"
              className="min-w-0 flex-1 truncate rounded-md bg-muted/50 px-2 py-1.5 text-left text-[12px] text-foreground hover:bg-muted"
              onClick={() => speak(p.text)}
            >
              {p.text}
            </button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[11px] text-muted-foreground"
              onClick={() => save(items.filter((x) => x.id !== p.id))}
            >
              消す
            </Button>
          </li>
        ))}
      </ul>
      {!items.length && (
        <p className="text-[10px] text-muted-foreground">まだありません。よく言う文を追加してください。</p>
      )}
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
