import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  acceptInvite,
  cancelInvite,
  dismissOperator,
  inviteOperator,
  listMyListOps,
  listOwnerAudit,
  lookupSoulForInvite,
  rejectInvite,
  resignOperator,
  type AuditRow,
  type IncomingInvite,
  type OpSeat,
  type OperatingList,
} from "@/lib/profile/list-ops";
import { saveMyProfile } from "@/lib/profile/server";
import type { OpsPublic, SingerProfile } from "@/lib/profile/types";
import { useListTarget } from "@/lib/profile/list-target";

const ACTION_LABEL: Record<string, string> = {
  proxy_add: "代理追加",
  self_add: "本人追加",
  self_override: "本人が上書き",
  revoke: "30分取り消し",
  owner_remove: "オーナーが削除",
  appoint: "招待",
  accept: "承諾",
  reject: "拒否",
  dismiss: "解除",
  resign: "辞任",
};

export function ListOpsPanel({
  profile,
  onProfile,
}: {
  profile: SingerProfile;
  onProfile: (p: SingerProfile) => void;
}) {
  const [seats, setSeats] = useState<OpSeat[]>([]);
  const [incoming, setIncoming] = useState<IncomingInvite[]>([]);
  const [operating, setOperating] = useState<OperatingList[]>([]);
  const [today, setToday] = useState(0);
  const [maxOps, setMaxOps] = useState(20);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [soul, setSoul] = useState("");
  const [preview, setPreview] = useState<{ soulId: string; displayName: string } | null>(
    null,
  );

  const reload = () => {
    void listMyListOps()
      .then((b) => {
        setSeats(b.seats);
        setIncoming(b.incoming);
        setOperating(b.operating);
        setToday(b.todayProxyCount);
        setMaxOps(b.maxOps);
      })
      .catch(() => undefined);
  };

  useEffect(() => {
    reload();
  }, []);

  const run = (fn: () => Promise<unknown>) => {
    setBusy(true);
    setMsg("");
    void fn()
      .then(() => reload())
      .catch((e) => setMsg(e instanceof Error ? e.message : "失敗しました"))
      .finally(() => setBusy(false));
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
      <h2 className="text-sm font-semibold text-foreground sm:text-base">
        歌唱リスト運営
      </h2>
      <p className="mt-1 text-[11px] text-muted-foreground">
        魂のIDを招待し、承諾した人だけがリストへ代理追加できます。枠は招待中を含めて {maxOps} 人。今日の代理 {today}/50 曲。
      </p>
      {msg && <p className="mt-2 text-[11px] text-danger">{msg}</p>}

      {incoming.length > 0 && (
        <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
          <p className="text-[11px] font-medium text-foreground">届いている招待</p>
          <ul className="mt-2 space-y-1.5">
            {incoming.map((inv) => (
              <li key={inv.ownerId} className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 text-xs">
                  {inv.displayName}
                  <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                    {inv.soulId}
                  </span>
                </span>
                <Button
                  type="button"
                  size="sm"
                  disabled={busy}
                  onClick={() => run(() => acceptInvite({ data: inv.ownerId }))}
                >
                  承諾
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => run(() => rejectInvite({ data: inv.ownerId }))}
                >
                  拒否
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4">
        <p className="text-[11px] font-medium text-muted-foreground">
          公開ページへの出し方
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {(
            [
              ["hide", "出さない"],
              ["presence", "いることだけ"],
              ["count", "人数だけ"],
            ] as [OpsPublic, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setMsg("");
                void saveMyProfile({ data: { opsPublic: id } })
                  .then(onProfile)
                  .catch((e) =>
                    setMsg(e instanceof Error ? e.message : "保存できませんでした"),
                  )
                  .finally(() => setBusy(false));
              }}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px]",
                profile.opsPublic === id
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-background text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <p className="text-[11px] font-medium text-muted-foreground">
          運営 {seats.length}/{maxOps}
        </p>
        <form
          className="mt-2 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const p = await lookupSoulForInvite({ data: soul });
              setPreview(p);
            });
          }}
        >
          <input
            value={soul}
            onChange={(e) => {
              setSoul(e.target.value);
              setPreview(null);
            }}
            placeholder="魂のID"
            className="h-10 min-w-0 flex-1 rounded-full border border-border bg-background px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button type="submit" disabled={busy || !soul.trim()}>
            確認
          </Button>
        </form>
        {preview && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-xs">
            <span>
              {preview.displayName}{" "}
              <span className="font-mono text-[10px] text-muted-foreground">
                {preview.soulId}
              </span>
              を招待します
            </span>
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await inviteOperator({ data: preview.soulId });
                  setSoul("");
                  setPreview(null);
                })
              }
            >
              招待する
            </Button>
          </div>
        )}
        <ul className="mt-2 divide-y divide-border overflow-hidden rounded-xl border border-border">
          {seats.length === 0 && (
            <li className="px-3 py-6 text-center text-[11px] text-muted-foreground">
              まだいません。魂のIDを招待すると、承諾した人が代理追加できます。
            </li>
          )}
          {seats.map((s) => (
            <li key={s.opId} className="flex items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1 text-xs">
                {s.displayName}
                <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                  {s.soulId}
                </span>
                <span className="ml-1 text-[10px] text-muted-foreground">
                  {s.status === "pending" ? "承諾待ち" : "運営中"}
                </span>
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  run(() =>
                    s.status === "pending"
                      ? cancelInvite({ data: s.opId })
                      : dismissOperator({ data: s.opId }),
                  )
                }
              >
                {s.status === "pending" ? "取り消す" : "解除"}
              </Button>
            </li>
          ))}
        </ul>
      </div>

      {operating.length > 0 && (
        <OperatingLists lists={operating} busy={busy} onRun={run} />
      )}

      <OwnerAudit />
    </section>
  );
}

function OperatingLists({
  lists,
  busy,
  onRun,
}: {
  lists: OperatingList[];
  busy: boolean;
  onRun: (fn: () => Promise<unknown>) => void;
}) {
  const { hidden, hideSoul, unhideSoul } = useListTarget();
  const [resign, setResign] = useState<OperatingList | null>(null);
  return (
    <div className="mt-4">
      <p className="text-[11px] font-medium text-muted-foreground">
        自分が運営しているリスト
      </p>
      <ul className="mt-2 divide-y divide-border overflow-hidden rounded-xl border border-border">
        {lists.map((l) => (
          <li key={l.ownerId} className="flex flex-wrap items-center gap-2 px-3 py-2">
            <span className="min-w-0 flex-1 text-xs">
              {l.displayName}
              <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                {l.soulId}
              </span>
              {!l.addable && (
                <span className="ml-1 text-[10px] text-danger">追加できない</span>
              )}
            </span>
            {!l.addable &&
              (hidden.includes(l.soulId) ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => unhideSoul(l.soulId)}
                >
                  再表示
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => hideSoul(l.soulId)}
                >
                  非表示
                </Button>
              ))}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => setResign(l)}
            >
              辞任
            </Button>
          </li>
        ))}
      </ul>
      {resign && (
        <ResignDialog
          list={resign}
          busy={busy}
          onClose={() => setResign(null)}
          onDone={() => {
            onRun(() => resignOperator({ data: resign.ownerId }));
            setResign(null);
          }}
        />
      )}
    </div>
  );
}

function ResignDialog({
  list,
  busy,
  onClose,
  onDone,
}: {
  list: OperatingList;
  busy: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState(0);
  const [a, setA] = useState(false);
  const [b, setB] = useState(false);
  const [typed, setTyped] = useState("");
  const name = list.displayName || list.soulId;
  const token = list.soulId || list.displayName;
  return (
    <div className="mt-3 rounded-xl border border-danger/30 bg-danger-soft p-3 text-xs text-foreground">
      {step === 0 && (
        <>
          <p>辞任するリストは「{name}」です。</p>
          <Button type="button" size="sm" className="mt-2" onClick={() => setStep(1)}>
            次へ
          </Button>
        </>
      )}
      {step === 1 && (
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={a}
            onChange={(e) => setA(e.target.checked)}
            className="mt-0.5"
          />
          <span>代理で入れた曲は残る。あとから自分では消せない。</span>
        </label>
      )}
      {step === 2 && (
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={b}
            onChange={(e) => setB(e.target.checked)}
            className="mt-0.5"
          />
          <span>30分取り消しは即無効になる。</span>
        </label>
      )}
      {step === 3 && (
        <label className="block">
          リストの魂のID「{token}」を入力して確定
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2"
          />
        </label>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {step > 0 && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setStep(step - 1)}>
            戻る
          </Button>
        )}
        {step === 1 && (
          <Button type="button" size="sm" disabled={!a} onClick={() => setStep(2)}>
            次へ
          </Button>
        )}
        {step === 2 && (
          <Button type="button" size="sm" disabled={!b} onClick={() => setStep(3)}>
            次へ
          </Button>
        )}
        {step === 3 && (
          <Button
            type="button"
            size="sm"
            variant="danger"
            disabled={busy || typed.trim() !== token}
            onClick={onDone}
          >
            辞任する
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          やめる
        </Button>
      </div>
    </div>
  );
}

function OwnerAudit() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const load = (p = 1, query = q) => {
    void listOwnerAudit({ data: { q: query, page: p } })
      .then((res) => {
        setRows(res.rows);
        setTotal(res.total);
        setPage(res.page);
      })
      .catch(() => {
        setRows([]);
        setTotal(0);
      });
  };
  useEffect(() => {
    load(1, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pages = Math.max(1, Math.ceil(total / 20));
  return (
    <div className="mt-4">
      <p className="text-[11px] font-medium text-muted-foreground">
        履歴（この画面だけ。普段の検索には使いません）
      </p>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          load(1, q.trim());
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="曲名・魂のID・操作"
          className="h-9 min-w-0 flex-1 rounded-full border border-border bg-background px-3 text-sm"
        />
        <Button type="submit" size="sm" variant="secondary">
          検索
        </Button>
      </form>
      <ul className="mt-2 divide-y divide-border overflow-hidden rounded-xl border border-border">
        {rows.length === 0 && (
          <li className="px-3 py-6 text-center text-[11px] text-muted-foreground">
            まだ履歴がありません。
          </li>
        )}
        {rows.map((r) => (
          <li key={r.id} className="px-3 py-2 text-[11px]">
            <span className="font-medium">
              {ACTION_LABEL[r.action] || r.action}
            </span>
            {r.songTitle ? ` · ${r.songTitle}` : ""}
            {r.actorName ? ` · ${r.actorName}` : ""}
            {r.actorSoulId ? (
              <span className="font-mono text-muted-foreground"> {r.actorSoulId}</span>
            ) : null}
            {r.createdAt && (
              <span className="ml-1 text-muted-foreground">
                {r.createdAt.replace("T", " ").slice(0, 16)}
              </span>
            )}
          </li>
        ))}
      </ul>
      {pages > 1 && (
        <div className="mt-2 flex justify-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={page <= 1}
            onClick={() => load(page - 1)}
          >
            前
          </Button>
          <span className="text-[11px] text-muted-foreground">
            {page} / {pages}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={page >= pages}
            onClick={() => load(page + 1)}
          >
            次
          </Button>
        </div>
      )}
    </div>
  );
}
