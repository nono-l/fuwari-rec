import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Search, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  adminDeleteSong,
  adminSearchProfiles,
  adminSetProfilePublic,
  appointAdmin,
  listAdmins,
  removeAdmin,
  type AdminProfileRow,
  type AdminRow,
} from "@/lib/admin/server";
import { searchSongs } from "@/lib/songdb/server";
import { songCode, vocalMetaLabel, type Song } from "@/lib/songdb/types";

export function AdminPanel() {
  return (
    <div className="space-y-4">
      <AdminsCard />
      <SongsCard />
      <ProfilesCard />
    </div>
  );
}

function AdminsCard() {
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [defaultEmail, setDefaultEmail] = useState("");
  const [defaultUserIds, setDefaultUserIds] = useState<string[]>([]);
  const [by, setBy] = useState<"id" | "email" | "soul">("id");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const reload = () =>
    listAdmins()
      .then((r) => {
        setRows(r.admins);
        setDefaultEmail(r.defaultEmail);
        setDefaultUserIds(r.defaultUserIds ?? []);
      })
      .catch((e) => setMsg(e instanceof Error ? e.message : "読み込めませんでした"));

  useEffect(() => {
    void reload();
  }, []);

  const run = (fn: () => Promise<unknown>) => {
    setBusy(true);
    setMsg("");
    void fn()
      .then(() => reload())
      .catch((e) => setMsg(e instanceof Error ? e.message : "失敗しました"))
      .finally(() => setBusy(false));
  };

  const placeholder =
    by === "id" ? "内部ID（プロフィールに表示）" : by === "email" ? "メール" : "魂のID";

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <ShieldCheck className="size-4 text-primary" />
        管理者
      </h2>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
        ビルトインは {defaultEmail || "touko5536@gmail.com"} の連携アカウントと、内部ID {defaultUserIds.join("、") || "dIb2xDgKlwdhphLFMK1VEL9WGFDnlb7f"} です。外せません。任命は内部IDが既定です。メールや魂のIDでもできます。
      </p>
      {msg && <p className="mt-2 text-[11px] text-danger">{msg}</p>}

      <div className="mt-3 flex flex-wrap gap-1">
        {(
          [
            ["id", "内部ID"],
            ["email", "メール"],
            ["soul", "魂のID"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setBy(key);
              setValue("");
            }}
            className={
              by === key
                ? "rounded-full bg-primary px-3 py-1 text-[11px] font-medium text-primary-foreground"
                : "rounded-full px-3 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted"
            }
          >
            {label}
          </button>
        ))}
      </div>

      <form
        className="mt-2 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          const v = value.trim();
          if (!v) return;
          run(async () => {
            await appointAdmin({
              data:
                by === "id"
                  ? { userId: v }
                  : by === "email"
                    ? { email: v }
                    : { soulId: v },
            });
            setValue("");
          });
        }}
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          className="h-10 min-w-0 flex-1 rounded-full border border-border bg-background px-4 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button type="submit" disabled={busy || !value.trim()}>
          任命する
        </Button>
      </form>

      <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border">
        {rows.length === 0 && (
          <li className="px-3 py-6 text-center text-[11px] text-muted-foreground">
            まだ一覧を読み込んでいます。
          </li>
        )}
        {rows.map((r) => (
          <li key={r.email} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
            <span className="min-w-0 flex-1 text-xs">
              <span className="font-medium text-foreground">
                {r.displayName || r.userId || r.email}
              </span>
              {r.userId ? (
                <span className="ml-1 break-all font-mono text-[10px] text-muted-foreground">
                  {r.userId}
                </span>
              ) : null}
              {r.soulId ? (
                <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                  {r.soulId}
                </span>
              ) : null}
              {r.builtin && (
                <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-foreground">
                  ビルトイン
                </span>
              )}
              {!r.userId && (
                <span className="ml-1 text-[10px] text-muted-foreground">
                  まだサインインなし
                </span>
              )}
            </span>
            {!r.builtin && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm(`${r.displayName || r.userId || r.email} を管理者から外しますか？`)) return;
                  run(() => removeAdmin({ data: r.email }));
                }}
              >
                外す
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function SongsCard() {
  const [q, setQ] = useState("");
  const [songs, setSongs] = useState<Song[]>([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = (query = q) => {
    setBusy(true);
    setMsg("");
    void searchSongs({ data: { q: query, page: 1, pageSize: 20 } })
      .then((r) => {
        setSongs(r.songs);
        setTotal(r.total);
      })
      .catch((e) => setMsg(e instanceof Error ? e.message : "検索に失敗しました"))
      .finally(() => setBusy(false));
  };

  useEffect(() => {
    load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
      <h2 className="text-sm font-semibold text-foreground">楽曲</h2>
      <p className="mt-1 text-[11px] text-muted-foreground">
        どの曲も削除できます。最初から入っている曲も対象です。
      </p>
      {msg && <p className="mt-2 text-[11px] text-danger">{msg}</p>}
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          load(q.trim());
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="曲名・歌手・管理番号"
          className="h-10 min-w-0 flex-1 rounded-full border border-border bg-background px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button type="submit" size="sm" variant="secondary" disabled={busy}>
          <Search className="size-3.5" />
          検索
        </Button>
      </form>
      <p className="mt-2 text-[11px] tabular-nums text-muted-foreground">
        {busy ? "検索中…" : `${total} 曲`}
      </p>
      {songs.length === 0 && !busy ? (
        <EmptyState
          icon={Search}
          title="曲はありません"
          className="py-8"
        />
      ) : (
        <ul className="mt-2 divide-y divide-border overflow-hidden rounded-xl border border-border">
          {songs.map((s) => (
            <li key={s.id} className="flex items-center gap-2 px-3 py-2">
              <Link
                to="/songdb/$code"
                params={{ code: songCode(s) }}
                className="min-w-0 flex-1"
              >
                <span className="block truncate text-xs font-medium text-foreground">
                  {s.title}
                </span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {s.artist}
                  {songCode(s) ? ` · ${songCode(s)}` : ""}
                  {vocalMetaLabel(s) ? ` · ${vocalMetaLabel(s)}` : ""}
                </span>
              </Link>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm(`「${s.title}」を削除します。元に戻せません。`)) {
                    return;
                  }
                  setBusy(true);
                  void adminDeleteSong({ data: s.id })
                    .then(() => load(q.trim()))
                    .catch((e) =>
                      setMsg(e instanceof Error ? e.message : "削除できませんでした"),
                    )
                    .finally(() => setBusy(false));
                }}
              >
                <Trash2 className="size-3.5" />
                削除
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ProfilesCard() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<AdminProfileRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = (query = q) => {
    setBusy(true);
    setMsg("");
    void adminSearchProfiles({ data: query })
      .then((r) => setRows(r.profiles))
      .catch((e) => setMsg(e instanceof Error ? e.message : "検索に失敗しました"))
      .finally(() => setBusy(false));
  };

  useEffect(() => {
    load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <UserRound className="size-4 text-primary" />
        公開プロフィール
      </h2>
      <p className="mt-1 text-[11px] text-muted-foreground">
        公開を止めたり、再開できます。アカウントそのものは消しません。
      </p>
      {msg && <p className="mt-2 text-[11px] text-danger">{msg}</p>}
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          load(q.trim());
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="表示名・魂のID・メール"
          className="h-10 min-w-0 flex-1 rounded-full border border-border bg-background px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button type="submit" size="sm" variant="secondary" disabled={busy}>
          <Search className="size-3.5" />
          検索
        </Button>
      </form>
      <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border">
        {rows.length === 0 && (
          <li className="px-3 py-6 text-center text-[11px] text-muted-foreground">
            {busy ? "読み込み中…" : "まだありません"}
          </li>
        )}
        {rows.map((p) => (
          <li key={p.userId} className="flex flex-wrap items-center gap-2 px-3 py-2">
            <span className="min-w-0 flex-1 text-xs">
              {p.soulId ? (
                <Link
                  to="/c/$soulId"
                  params={{ soulId: p.soulId }}
                  className="font-medium text-foreground hover:underline"
                >
                  {p.displayName || p.soulId}
                </Link>
              ) : (
                <span className="font-medium">{p.displayName || "（無名）"}</span>
              )}
              {p.email ? (
                <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                  {p.email}
                </span>
              ) : null}
              <span className="ml-1 text-[10px] text-muted-foreground">
                {p.isPublic ? "公開" : "非公開"}
              </span>
            </span>
            <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  const next = !p.isPublic;
                  setBusy(true);
                  void adminSetProfilePublic({
                    data: { userId: p.userId, isPublic: next },
                  })
                    .then(() => load(q.trim()))
                    .catch((e) =>
                      setMsg(e instanceof Error ? e.message : "できませんでした"),
                    )
                    .finally(() => setBusy(false));
                }}
              >
                {p.isPublic ? "公開を止める" : "公開する"}
              </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
