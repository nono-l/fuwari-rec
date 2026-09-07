import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  BadgeCheck,
  ExternalLink,
  Globe,
  Link2,
  Music2,
  Save,
  SlidersHorizontal,
  Unlink,
  Youtube,
} from "lucide-react";
import { z } from "zod";
import { AppShell } from "@/components/editor/app-shell";
import { Button } from "@/components/ui/button";
import {
  RedirectToSignIn,
  SignedIn,
  SignedOut,
} from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  getMyProfile,
  linkXproof,
  saveMyProfile,
  unlinkXproof,
} from "@/lib/profile/server";
import type { PublicFxCard, SingerProfile } from "@/lib/profile/types";
import { XPROOF_ORIGIN } from "@/lib/profile/types";
import {
  clearXproofState,
  newXproofState,
  parseXproofGrant,
  parseYoutubeHandle,
  readXproofState,
  slugifyHandle,
  xproofConnectUrl,
} from "@/lib/profile/xproof";
import { loadFxLibrary } from "@/lib/audio/fx-snapshot";
import { insertSummary } from "@/components/editor/obs-filter-rack";
import { useEditorStore } from "@/lib/store/editor-store";
import { semitoneSpan, hzToMidi } from "@/lib/audio/pitch";

const searchSchema = z.object({
  token: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
});

export const Route = createFileRoute("/profile")({
  validateSearch: (s) => searchSchema.parse(s),
  component: ProfilePage,
  head: () => ({ meta: [{ title: "プロフィール — Fuwari REC" }] }),
});

function ProfilePage() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return (
      <AppShell title="プロフィール">
        <div className="h-40 animate-pulse rounded-2xl bg-muted" />
      </AppShell>
    );
  }
  if (!user) {
    return (
      <AppShell title="プロフィール">
        <SignedOut>
          <RedirectToSignIn />
        </SignedOut>
      </AppShell>
    );
  }
  return (
    <AppShell
      title="プロフィール"
      description="XProof で証明した X / YouTube と、声域・エフェクトを公開ページに載せます。"
    >
      <SignedIn>
        <ProfileEditor />
      </SignedIn>
    </AppShell>
  );
}

function ProfileEditor() {
  const search = Route.useSearch();
  const user = useCurrentUserState().user;
  const [profile, setProfile] = useState<SingerProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(search.error ?? null);
  const [token, setToken] = useState(search.token ?? "");
  const [xInput, setXInput] = useState("");
  const [ytInput, setYtInput] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [slug, setSlug] = useState("");
  const [library, setLibrary] = useState<ReturnType<typeof loadFxLibrary>>(
    [],
  );
  const rangeMinNote = useEditorStore((s) => s.rangeMinNote);
  const rangeMaxNote = useEditorStore((s) => s.rangeMaxNote);
  const rangeMinHz = useEditorStore((s) => s.rangeMinHz);
  const rangeMaxHz = useEditorStore((s) => s.rangeMaxHz);

  useEffect(() => {
    setLibrary(loadFxLibrary());
  }, []);

  useEffect(() => {
    void getMyProfile()
      .then((p) => {
        setProfile(p);
        setDisplayName(p.displayName || user?.displayName || "");
        setBio(p.bio);
        setSlug(p.slug);
        setXInput(p.xHandle);
        setYtInput(p.youtube.join(", "));
      })
      .catch((e) =>
        setMessage(e instanceof Error ? e.message : "読み込みに失敗しました"),
      );
  }, [user?.displayName]);

  const applyGrant = async (grantToken: string) => {
    setBusy(true);
    try {
      const result = await linkXproof({ data: { token: grantToken } });
      clearXproofState();
      setProfile(result.profile);
      setXInput(result.profile.xHandle);
      setYtInput(result.profile.youtube.join(", "));
      setMessage(
        result.profile.xproofLinked
          ? "XProof とつなぎました"
          : result.consumeError || "許可情報を受け取れませんでした",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "連携に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!search.token) return;
    const expected = readXproofState();
    if (search.state && expected && search.state !== expected) {
      setMessage("連携の状態が一致しません。もう一度つなぎ直してください。");
      return;
    }
    void applyGrant(search.token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.token, search.state]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const grant = parseXproofGrant(e.origin, e.data, readXproofState());
      if (!grant) return;
      void applyGrant(grant.token);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startConnect = () => {
    const state = newXproofState();
    const returnTo = `${window.location.origin}/profile`;
    const url = xproofConnectUrl(returnTo, state);
    const popup = window.open(url, "xproof-connect", "width=480,height=780");
    if (!popup) window.location.href = url;
  };

  const saveBasics = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const next = await saveMyProfile({
        data: {
          displayName,
          bio,
          slug,
          avatarUrl: user?.profileImageUrl ?? "",
          xHandle: xInput,
          youtube: ytInput
            .split(/[,\s]+/)
            .map((s) => parseYoutubeHandle(s))
            .filter((s): s is string => Boolean(s)),
        },
      });
      setProfile(next);
      setSlug(next.slug);
      setMessage("保存しました");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const submitToken = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const youtube = ytInput
        .split(/[,\s]+/)
        .map((s) => parseYoutubeHandle(s))
        .filter((s): s is string => Boolean(s));
      const result = await linkXproof({
        data: {
          token: token.trim() || undefined,
          xHandle: xInput,
          youtube,
        },
      });
      setProfile(result.profile);
      setXInput(result.profile.xHandle);
      setYtInput(result.profile.youtube.join(", "));
      setToken("");
      setMessage(
        result.profile.xproofLinked
          ? "XProof の証明をプロフィールに載せました"
          : result.consumeError || "ハンドルを保存しました",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "連携に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const publishRange = async () => {
    if (!rangeMinNote || !rangeMaxNote) {
      setMessage("先に声域測定タブで測ってください");
      return;
    }
    setBusy(true);
    try {
      const span =
        rangeMinHz != null && rangeMaxHz != null
          ? semitoneSpan(hzToMidi(rangeMinHz), hzToMidi(rangeMaxHz))
          : 0;
      const next = await saveMyProfile({
        data: {
          rangeMinNote,
          rangeMaxNote,
          rangeSpan: span,
        },
      });
      setProfile(next);
      setMessage(`声域 ${rangeMinNote} 〜 ${rangeMaxNote} を公開しました`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "公開に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const publishFx = async (card: PublicFxCard) => {
    if (!profile) return;
    const fx = [
      card,
      ...profile.fx.filter((f) => f.id !== card.id),
    ].slice(0, 12);
    setBusy(true);
    try {
      const next = await saveMyProfile({ data: { fx } });
      setProfile(next);
      setMessage(`エフェクト「${card.name}」を公開しました`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "公開に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const publicUrl = profile ? `/u/${profile.slug}` : "";

  return (
    <div className="flex flex-col gap-4">
      {message && (
        <p className="rounded-xl border border-border bg-muted/50 px-4 py-2 text-sm text-foreground">
          {message}
        </p>
      )}

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground sm:text-base">
              <Link2 className="size-4 text-primary" />
              XProof と連携
            </h2>
            <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-muted-foreground sm:text-xs">
              XProof で渡してよい X / YouTube を選ぶと、JSON で戻ります。
              URL にハンドルは出ません。
            </p>
          </div>
          <a
            href={XPROOF_ORIGIN}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
          >
            xauth.grok.me
            <ExternalLink className="size-3" />
          </a>
        </div>

        {profile?.xproofLinked && (
          <div className="mb-4 flex flex-wrap gap-2">
            {profile.xHandle && (
              <a
                href={`https://x.com/${profile.xHandle}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-foreground"
              >
                <BadgeCheck className="size-3.5 text-primary" />
                @{profile.xHandle}
              </a>
            )}
            {profile.youtube.map((ch) => (
              <a
                key={ch}
                href={`https://www.youtube.com/@${ch}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground"
              >
                <Youtube className="size-3.5 text-primary" />
                @{ch}
              </a>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={startConnect} disabled={busy}>
            <BadgeCheck className="size-4" />
            XProof でつなぐ
          </Button>
          {profile?.xproofLinked && (
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                void unlinkXproof().then((p) => {
                  setProfile(p);
                  setMessage("連携を解除しました");
                });
              }}
            >
              <Unlink className="size-4" />
              解除
            </Button>
          )}
        </div>

        <ol className="mt-4 list-decimal space-y-1 pl-5 text-[11px] text-muted-foreground sm:text-xs">
          <li>「XProof でつなぐ」で証明アプリを開く</li>
          <li>渡してよいアカウントにチェックして許可する</li>
          <li>この画面に JSON で戻る。戻らないときは下にトークンを貼る</li>
        </ol>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Tauth トークン">
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="XProof で発行したトークン"
              className={inputClass}
            />
          </Field>
          <Field label="X ハンドル">
            <input
              value={xInput}
              onChange={(e) => setXInput(slugifyHandle(e.target.value))}
              placeholder="mss_0337_2024"
              className={inputClass}
            />
          </Field>
          <Field label="YouTube チャンネル" className="sm:col-span-2">
            <input
              value={ytInput}
              onChange={(e) => setYtInput(e.target.value)}
              placeholder="@channel をカンマ区切り"
              className={inputClass}
            />
          </Field>
        </div>
        <div className="mt-3">
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => void submitToken()}
          >
            トークン / ハンドルを保存
          </Button>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground sm:text-base">
          <Globe className="size-4 text-primary" />
          公開ページ
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="表示名">
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="公開URL">
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">/u/</span>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className={inputClass}
              />
            </div>
          </Field>
          <Field label="ひとこと" className="sm:col-span-2">
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" disabled={busy} onClick={() => void saveBasics()}>
            <Save className="size-4" />
            プロフィールを保存
          </Button>
          {profile && (
            <Button asChild variant="secondary">
              <Link to="/u/$slug" params={{ slug: profile.slug }}>
                公開ページを見る
              </Link>
            </Button>
          )}
        </div>
        {publicUrl && (
          <p className="mt-2 text-[11px] text-muted-foreground">{publicUrl}</p>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground sm:text-base">
          <Music2 className="size-4 text-primary" />
          声域を公開
        </h2>
        <p className="mt-1 text-[11px] text-muted-foreground sm:text-xs">
          いま測定タブにある結果を公開プロフィールへ載せます。
        </p>
        <p className="mt-3 text-sm font-semibold text-foreground">
          {rangeMinNote && rangeMaxNote
            ? `${rangeMinNote} 〜 ${rangeMaxNote}`
            : "まだ測定していません"}
        </p>
        {profile?.rangeMinNote && (
          <p className="text-[11px] text-muted-foreground">
            公開中: {profile.rangeMinNote} 〜 {profile.rangeMaxNote}
            {profile.rangeSpan ? `（${profile.rangeSpan} 半音）` : ""}
          </p>
        )}
        <Button
          type="button"
          className="mt-3"
          variant="secondary"
          disabled={busy}
          onClick={() => void publishRange()}
        >
          この声域を公開する
        </Button>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground sm:text-base">
          <SlidersHorizontal className="size-4 text-primary" />
          エフェクト保存を公開
        </h2>
        {library.length === 0 ? (
          <p className="mt-2 text-[11px] text-muted-foreground">
            エフェクタータブでプリセットを保存すると、ここに出ます。
          </p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {library.map((p) => {
              const on = profile?.fx.some((f) => f.id === p.id);
              const summary = [
                p.inserts.map(insertSummary).filter(Boolean).slice(0, 3).join(" · "),
                p.filters.length ? `${p.filters.length} フィルター` : "",
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <li
                  key={p.id}
                  className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-2.5 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">{p.name}</div>
                    <div className="truncate text-[10px] text-muted-foreground">
                      {summary || "MIX"}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={on ? "default" : "secondary"}
                    disabled={busy}
                    onClick={() =>
                      void publishFx({
                        id: p.id,
                        name: p.name,
                        summary: summary || "MIX",
                        savedAt: p.savedAt,
                      })
                    }
                  >
                    {on ? "公開中" : "公開する"}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

const inputClass =
  "h-10 w-full rounded-full border border-border bg-background px-4 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={className}>
      <span className="mb-1 block text-[11px] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
