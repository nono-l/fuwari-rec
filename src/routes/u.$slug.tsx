import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getPublicProfile } from "@/lib/profile/server";

export const Route = createFileRoute("/u/$slug")({
  component: LegacyPublicRedirect,
});

function LegacyPublicRedirect() {
  const { slug } = Route.useParams();
  const [soulId, setSoulId] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    void getPublicProfile({ data: slug }).then((p) => {
      if (p?.soulId) setSoulId(p.soulId);
      else setMissing(true);
    });
  }, [slug]);

  if (soulId) {
    return <Navigate to="/c/$soulId" params={{ soulId }} replace />;
  }
  if (missing) return <Navigate to="/" replace />;
  return (
    <main className="grid min-h-dvh place-items-center bg-background">
      <div className="h-24 w-64 animate-pulse rounded-2xl bg-muted" />
    </main>
  );
}
