import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  BadgeCheck,
  Globe,
  Mic2,
  Music2,
  SlidersHorizontal,
  Youtube,
} from "lucide-react";
import { getPublicProfile } from "@/lib/profile/server";
import type { SingerProfile } from "@/lib/profile/types";
import { publicCardPath } from "@/lib/profile/xproof";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/c/$soulId")({
  component: PublicCardPage,
  head: ({ params }) => ({
    meta: [{ title: `${params.soulId} — Fuwari REC` }],
  }),
});

function PublicCardPage() {
  const { soulId } = Route.useParams();
  const [profile, setProfile] = useState<SingerProfile | null | undefined>(
    undefined,
  );

  useEffect(() => {
    void getPublicProfile({ data: soulId }).then(setProfile);
  }, [soulId]);

  if (profile === undefined) {
    return (
      <main className="grid min-h-dvh place-items-center bg-background pt-[var(--grok-banner-h,0px)]">
        <div className="h-32 w-80 animate-pulse rounded-2xl bg-muted" />
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="grid min-h-dvh place-items-center bg-background px-4 pt-[var(--grok-banner-h,0px)]">
        <div className="max-w-sm text-center">
          <p className="text-sm text-muted-foreground">
            この魂のIDの公開ページはありません
          </p>
          <Button asChild className="mt-4">
            <Link to="/">スタジオへ</Link>
          </Button>
        </div>
      </main>
    );
  }

  const name = profile.displayName || profile.soulId;

  return (
    <main className="min-h-dvh bg-background px-4 py-8 pt-[calc(var(--grok-banner-h,0px)+2rem)] text-foreground">
      <div className="mx-auto max-w-lg">
        <div className="mb-6 flex items-center gap-2 text-xs text-muted-foreground">
          <Mic2 className="size-3.5 text-primary" />
          Fuwari REC
        </div>
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3">
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt=""
                className="size-14 rounded-full object-cover"
              />
            ) : (
              <div className="grid size-14 place-items-center rounded-full bg-primary text-lg font-semibold text-primary-foreground">
                {name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight">{name}</h1>
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                {publicCardPath(profile.soulId)}
              </p>
              {profile.xHandle && (
                <a
                  href={`https://x.com/${profile.xHandle}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  <BadgeCheck className="size-3.5" />
                  @{profile.xHandle}
                  <span className="text-[11px] text-muted-foreground">
                    XProof
                  </span>
                </a>
              )}
            </div>
          </div>
          {profile.bio && (
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              {profile.bio}
            </p>
          )}

          {profile.youtube.length > 0 && (
            <div className="mt-4">
              <p className="text-[11px] font-medium text-muted-foreground">
                YouTube（XProof 証明）
              </p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {profile.youtube.map((ch) => (
                  <a
                    key={ch}
                    href={`https://www.youtube.com/@${ch}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium"
                  >
                    <Youtube className="size-3.5 text-primary" />
                    @{ch}
                  </a>
                ))}
              </div>
            </div>
          )}

          {profile.rangeMinNote && profile.rangeMaxNote && (
            <div className="mt-5 rounded-xl border border-border bg-muted/30 px-4 py-3">
              <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <Music2 className="size-3.5 text-primary" />
                声域
              </p>
              <p className="mt-1 text-lg font-semibold tracking-tight">
                {profile.rangeMinNote} 〜 {profile.rangeMaxNote}
              </p>
              {profile.rangeSpan > 0 && (
                <p className="text-xs text-muted-foreground">
                  {profile.rangeSpan} 半音
                </p>
              )}
            </div>
          )}

          {profile.fx.length > 0 && (
            <div className="mt-5">
              <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <SlidersHorizontal className="size-3.5 text-primary" />
                公開エフェクト
              </p>
              <ul className="mt-2 space-y-1.5">
                {profile.fx.map((fx) => (
                  <li
                    key={fx.id}
                    className="rounded-xl border border-border bg-muted/30 px-3 py-2"
                  >
                    <div className="text-sm font-medium">{fx.name}</div>
                    {fx.summary && (
                      <div className="text-[11px] text-muted-foreground">
                        {fx.summary}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/">スタジオで歌う</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to="/profile">
              <Globe className="size-3.5" />
              自分のカード
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
