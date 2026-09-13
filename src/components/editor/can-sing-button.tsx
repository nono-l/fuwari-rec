import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Mic2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { SIGN_IN_PATH } from "@/lib/auth/gates";
import { markSingableOn, unmarkSingableOn } from "@/lib/profile/list-ops";
import { useListTarget } from "@/lib/profile/list-target";
import { useOperatingLists } from "@/components/editor/list-target-bar";
import { cn } from "@/lib/utils";

export function CanSingButton({
  songId,
  marked,
  canRevoke = false,
  source = "self",
  targetLabel = "",
  onChange,
  className,
}: {
  songId: string;
  marked: boolean;
  canRevoke?: boolean;
  source?: "self" | "proxy";
  targetLabel?: string;
  onChange?: (
    on: boolean,
    info?: { source: "self" | "proxy"; canRevoke: boolean },
  ) => void;
  className?: string;
}) {
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  const { soulId, hideSoul } = useListTarget();
  const ops = useOperatingLists();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const proxy = Boolean(soulId);
  const on = marked;
  const name =
    targetLabel ||
    ops.lists.find((l) => l.soulId === soulId)?.displayName ||
    "";

  const label = !on
    ? proxy
      ? `代理で登録${name ? ` · ${name}` : ""}`
      : "これ歌える"
    : proxy
      ? canRevoke
        ? "取り消し"
        : source === "self"
          ? "本人登録"
          : "歌える"
      : "歌える";

  const disabled = busy || isPending || (on && proxy && !canRevoke);

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <Button
        type="button"
        size="sm"
        variant={on && !proxy ? "default" : "secondary"}
        disabled={disabled}
        className={cn(
          "shrink-0",
          proxy &&
            "border-amber-600/60 bg-amber-100 text-amber-950 hover:bg-amber-200 dark:bg-amber-950/40 dark:text-amber-100",
          className,
        )}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!user) {
            void navigate({ to: SIGN_IN_PATH });
            return;
          }
          if (on && proxy && !canRevoke) return;
          setBusy(true);
          setErr("");
          const run = on ? unmarkSingableOn : markSingableOn;
          void run({ data: { songId, targetSoulId: soulId || undefined } })
            .then((res) => {
              const nextOn = "on" in res ? Boolean(res.on) : !on;
              const nextSource =
                "source" in res && (res.source === "proxy" || res.source === "self")
                  ? res.source
                  : soulId
                    ? "proxy"
                    : "self";
              onChange?.(nextOn, {
                source: nextSource,
                canRevoke: nextOn && Boolean(soulId) && nextSource === "proxy",
              });
            })
            .catch((error) => {
              const msg = error instanceof Error ? error.message : "";
              if (/unauth/i.test(msg) || /sign/i.test(msg)) {
                void navigate({ to: SIGN_IN_PATH });
                return;
              }
              setErr(msg || "できませんでした");
            })
            .finally(() => setBusy(false));
        }}
      >
        <Mic2 className="size-3.5" />
        {label}
      </Button>
      {err && (
        <span className="max-w-[14rem] text-right text-[10px] text-danger">
          {err}
          {soulId && /非表示/.test(err) && (
            <button
              type="button"
              className="ml-1 underline"
              onClick={() => {
                hideSoul(soulId);
                setErr("");
              }}
            >
              非表示にする
            </button>
          )}
        </span>
      )}
    </span>
  );
}
