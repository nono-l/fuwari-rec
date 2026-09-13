import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ExternalLink, Headphones, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SIGN_IN_PATH } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useIsAdmin } from "@/lib/admin/use-is-admin";
import {
  addSongLink,
  deleteSongLink,
  listSongLinks,
  type SongListenLink,
} from "@/lib/songdb/links";

export function SongListenLinks({ songId }: { songId: string }) {
  const { user, isPending } = useCurrentUserState();
  const { admin } = useIsAdmin();
  const [links, setLinks] = useState<SongListenLink[]>([]);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reload = () => {
    void listSongLinks({ data: songId })
      .then(setLinks)
      .catch(() => setLinks([]));
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songId]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    setError("");
    try {
      await addSongLink({ data: { songId, url } });
      setUrl("");
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "追加できませんでした");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Headphones className="size-4 text-primary" />
        サブスクで聴く
      </h3>
      {links.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          まだURLはありません。
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border">
          {links.map((l) => (
            <li key={l.id} className="flex items-center gap-2 px-3 py-2">
              <a
                href={l.url}
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 flex-1 items-center gap-2 text-sm text-foreground hover:text-primary"
              >
                <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate font-medium">{l.service}</span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {l.url.replace(/^https?:\/\//, "")}
                </span>
              </a>
              {user && (admin || l.createdBy === user.id) && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    void deleteSongLink({ data: l.id })
                      .then(reload)
                      .catch((err) =>
                        setError(
                          err instanceof Error ? err.message : "消せませんでした",
                        ),
                      )
                      .finally(() => setBusy(false));
                  }}
                >
                  <Trash2 className="size-3.5" />
                  削除
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {isPending ? null : user ? (
        <form onSubmit={(e) => void add(e)} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://open.spotify.com/track/…"
            className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button type="submit" disabled={busy || !url.trim()}>
            追加
          </Button>
        </form>
      ) : (
        <p className="mt-3 text-[12px] text-muted-foreground">
          <Link to={SIGN_IN_PATH} className="text-primary hover:underline">
            ログイン
          </Link>
          すると Spotify / Apple Music などのURLを追加できます。
        </p>
      )}
      {error && <p className="mt-2 text-[11px] text-danger">{error}</p>}
    </section>
  );
}
