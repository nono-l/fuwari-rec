import { useEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  ListMusic,
  Mic2,
  Music2,
  ScanSearch,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/lib/store/editor-store";
import { MIX_PRESETS } from "@/lib/audio/types";
import { useIsAdmin } from "@/lib/admin/use-is-admin";

const NAV = [
  { to: "/", label: "スタジオ", icon: Mic2 },
  { to: "/effector", label: "エフェクター", icon: SlidersHorizontal },
  { to: "/AI", label: "AI", icon: Sparkles },
  { to: "/range", label: "声域測定", icon: Music2 },
  { to: "/analyze", label: "音源解析", icon: ScanSearch },
  { to: "/songdb", label: "楽曲リスト", icon: ListMusic },
  { to: "/profile", label: "プロフィール", icon: UserRound },
  { to: "/cloud", label: "リモート管理", icon: Shield },
] as const;

export function AppNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { admin } = useIsAdmin();
  const liveFxActive = useEditorStore((s) => s.liveFxActive);
  const rangeMeasuring = useEditorStore((s) => s.rangeMeasuring);
  const rangeMinNote = useEditorStore((s) => s.rangeMinNote);
  const rangeMaxNote = useEditorStore((s) => s.rangeMaxNote);
  const mediaRangeResult = useEditorStore((s) => s.mediaRangeResult);
  const mediaRangeAnalyzing = useEditorStore((s) => s.mediaRangeAnalyzing);
  const youtubeVideoId = useEditorStore((s) => s.youtubeVideoId);
  const youtubeClips = useEditorStore((s) => s.youtubeClips);
  const youtubePinned = useEditorStore((s) => s.youtubePinned);
  const toggleYoutubePinned = useEditorStore((s) => s.toggleYoutubePinned);
  const master = useEditorStore((s) => s.master);
  const presetLabel =
    MIX_PRESETS.find((p) => p.id === master.preset)?.label ?? master.preset;

  const scrollerRef = useRef<HTMLElement>(null);
  const [fade, setFade] = useState({ left: false, right: false });

  const updateFade = () => {
    const el = scrollerRef.current;
    if (!el) return;
    setFade({
      left: el.scrollLeft > 6,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 6,
    });
  };

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    updateFade();
    const active = el.querySelector('[aria-current="page"]') as HTMLElement | null;
    if (active) {
      const left = active.offsetLeft - (el.clientWidth - active.offsetWidth) / 2;
      el.scrollTo({ left: Math.max(0, left), behavior: "auto" });
      updateFade();
    }
    const ro = new ResizeObserver(updateFade);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pathname]);

  return (
    <div className="mt-4 flex flex-col gap-2 lg:flex-row lg:items-center">
      <div className="relative min-w-0 flex-1">
        <nav
          ref={scrollerRef}
          onScroll={updateFade}
          className="flex w-full max-w-full gap-0.5 overflow-x-auto overflow-y-hidden overscroll-x-contain rounded-full border border-border bg-card p-1 shadow-sm [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden"
          aria-label="メインメニュー"
        >
          {(admin
            ? [...NAV, { to: "/admin", label: "管理", icon: ShieldCheck }]
            : NAV
          ).map((item) => {
            const Icon = item.icon;
            const active =
              item.to === "/"
                ? pathname === "/"
                : pathname === item.to || pathname.startsWith(`${item.to}/`);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2 text-xs font-medium transition-[color,background-color,box-shadow] duration-200 ease-out sm:text-sm",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="size-3.5 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-0 left-0 w-7 rounded-l-full bg-gradient-to-r from-card to-transparent transition-opacity",
            fade.left ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-0 right-0 w-7 rounded-r-full bg-gradient-to-l from-card to-transparent transition-opacity",
            fade.right ? "opacity-100" : "opacity-0",
          )}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[11px] text-muted-foreground">
          MIX:{" "}
          <span className="font-semibold text-foreground">{presetLabel}</span>
        </span>
        {liveFxActive && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground">
            <span className="size-1.5 animate-pulse rounded-full bg-primary-foreground" />
            エフェクター稼働中
          </span>
        )}
        {rangeMeasuring && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-[11px] font-semibold text-success">
            <span className="size-1.5 animate-pulse rounded-full bg-success" />
            声域測定中
          </span>
        )}
        {!rangeMeasuring && rangeMinNote && rangeMaxNote && (
          <span className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[11px] text-muted-foreground">
            声域:{" "}
            <span className="font-semibold text-foreground">
              {rangeMinNote}〜{rangeMaxNote}
            </span>
          </span>
        )}
        {mediaRangeAnalyzing && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-[11px] font-semibold text-success">
            <span className="size-1.5 animate-pulse rounded-full bg-success" />
            音源解析中
          </span>
        )}
        {!mediaRangeAnalyzing && mediaRangeResult && (
          <span className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[11px] text-muted-foreground">
            音源:{" "}
            <span className="font-semibold text-foreground">
              {mediaRangeResult.minNote}〜{mediaRangeResult.maxNote}
            </span>
          </span>
        )}
        {youtubeVideoId && (
          <button
            type="button"
            onClick={() => toggleYoutubePinned()}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
              youtubePinned
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-muted/50 text-muted-foreground hover:text-foreground",
            )}
            aria-pressed={youtubePinned}
          >
            📍{" "}
            {youtubePinned
              ? `YouTube 追従中${youtubeClips.length > 1 ? `（${youtubeClips.length}）` : ""}`
              : `YouTube をピン留め${youtubeClips.length > 1 ? `（${youtubeClips.length}）` : ""}`}
          </button>
        )}
      </div>
    </div>
  );
}
