import { useEffect, useState } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getMyAdmin } from "./server";

export function useIsAdmin() {
  const { user, isPending } = useCurrentUserState();
  const [admin, setAdmin] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (isPending) return;
    if (!user) {
      setAdmin(false);
      setReady(true);
      return;
    }
    setReady(false);
    let live = true;
    void getMyAdmin()
      .then((r) => {
        if (!live) return;
        setAdmin(Boolean(r.admin));
        setReady(true);
      })
      .catch(() => {
        if (!live) return;
        setAdmin(false);
        setReady(true);
      });
    return () => {
      live = false;
    };
  }, [user?.id, isPending]);

  return { admin, ready };
}
