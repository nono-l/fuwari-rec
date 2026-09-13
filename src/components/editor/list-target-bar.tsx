import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { listMyListOps, type OperatingList } from "@/lib/profile/list-ops";
import { useListTarget } from "@/lib/profile/list-target";

type OpsSnap = {
  lists: OperatingList[];
  today: number;
  daily: number;
  ready: boolean;
};

let opsSnap: OpsSnap = { lists: [], today: 0, daily: 50, ready: false };
const opsListeners = new Set<() => void>();
let opsUserId: string | null = null;
let opsInflight: Promise<void> | null = null;
let opsSeq = 0;

function emitOps(next: OpsSnap) {
  opsSnap = next;
  opsListeners.forEach((fn) => fn());
}

function loadOps(userId: string | null) {
  if (!userId) {
    opsSeq += 1;
    opsUserId = null;
    opsInflight = null;
    emitOps({ lists: [], today: 0, daily: 50, ready: true });
    return;
  }
  if (opsInflight && opsUserId === userId) return;
  const seq = ++opsSeq;
  opsUserId = userId;
  opsInflight = listMyListOps()
    .then((b) => {
      if (seq !== opsSeq) return;
      emitOps({
        lists: b.operating,
        today: b.todayProxyCount,
        daily: b.proxyDaily,
        ready: true,
      });
    })
    .catch(() => {
      if (seq !== opsSeq) return;
      emitOps({ lists: [], today: 0, daily: 50, ready: true });
    })
    .finally(() => {
      if (seq === opsSeq) opsInflight = null;
    });
}

export function useOperatingLists() {
  const { user } = useCurrentUserState();
  const userId = user?.id ?? null;
  const snap = useSyncExternalStore(
    (fn) => {
      opsListeners.add(fn);
      return () => {
        opsListeners.delete(fn);
      };
    },
    () => opsSnap,
    () => opsSnap,
  );

  useEffect(() => {
    loadOps(userId);
  }, [userId]);

  return snap;
}

export function ListTargetBar() {
  const { user } = useCurrentUserState();
  const {
    soulId,
    hidden,
    diskSoulId,
    mismatched,
    setSoulId,
    hideSoul,
    followDisk,
    keepTab,
  } = useListTarget();
  const { lists, today, daily, ready } = useOperatingLists();
  const [gone, setGone] = useState("");

  const visible = lists.filter((l) => l.soulId && !hidden.includes(l.soulId));
  const current = visible.find((l) => l.soulId === soulId);
  const currentSoul = current?.soulId ?? "";
  const currentAddable = current?.addable ?? true;
  const proxy = Boolean(soulId);
  const diskName =
    lists.find((l) => l.soulId === diskSoulId)?.displayName ||
    diskSoulId ||
    "自分のリスト";
  const tabName = current?.displayName || (soulId ? soulId : "自分のリスト");
  const missing =
    ready && Boolean(soulId) && !lists.some((l) => l.soulId === soulId);

  useEffect(() => {
    if (currentSoul && !currentAddable) setGone(currentSoul);
    else setGone("");
  }, [currentSoul, currentAddable]);

  useEffect(() => {
    const uid = user?.id ?? null;
    const onVis = () => {
      if (document.visibilityState === "visible") loadOps(uid);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [user?.id]);

  if (!user || (visible.length === 0 && !soulId)) return null;

  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2",
        proxy
          ? "border-amber-600/50 bg-amber-50 dark:bg-amber-950/30"
          : "border-border bg-muted/30",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[11px] font-medium text-muted-foreground">
          追加先
        </label>
        <select
          value={soulId}
          onChange={(e) => {
            const v = e.target.value;
            const hit = visible.find((l) => l.soulId === v);
            if (hit && !hit.addable) {
              setGone(hit.soulId);
              return;
            }
            setGone("");
            setSoulId(v);
          }}
          className={cn(
            "h-8 min-w-[12rem] rounded-full border px-3 text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ring",
            proxy
              ? "border-amber-600/60 bg-amber-100 text-amber-950 dark:bg-amber-950/50 dark:text-amber-100"
              : "border-border bg-background text-foreground",
          )}
        >
          <option value="">自分のリスト</option>
          {visible.map((l) => (
            <option key={l.soulId} value={l.soulId}>
              {l.displayName}
              {l.soulId ? ` · ${l.soulId}` : ""}
              {l.addable ? "" : "（追加できない）"}
            </option>
          ))}
          {soulId && !visible.some((l) => l.soulId === soulId) && (
            <option value={soulId}>（このタブのリスト）</option>
          )}
        </select>
        {proxy && (
          <span className="text-[10px] font-medium text-amber-800 dark:text-amber-200">
            代理
          </span>
        )}
        {proxy && (
          <span className="text-[10px] tabular-nums text-muted-foreground">
            今日 {today}/{daily}
          </span>
        )}
      </div>

      {mismatched && (
        <div className="mt-2 rounded-lg border border-amber-600/40 bg-background/70 px-2.5 py-2 text-[11px] text-foreground">
          他のタブで追加先が「{diskName}」に変わっています。このタブは「{tabName}」のままです。
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Button type="button" size="sm" onClick={followDisk}>
              このタブも合わせる
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={keepTab}>
              このタブのまま
            </Button>
          </div>
        </div>
      )}

      {(gone || missing) && (
        <div className="mt-2 text-[11px] text-foreground">
          {missing
            ? "このリストの運営ではなくなりました。"
            : "このリストはもう追加できません。"}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ml-1"
            onClick={() => {
              if (gone) hideSoul(gone);
              else if (soulId) hideSoul(soulId);
              setGone("");
            }}
          >
            メニューから非表示
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setSoulId("");
              setGone("");
            }}
          >
            自分のリストに戻す
          </Button>
        </div>
      )}
    </div>
  );
}
