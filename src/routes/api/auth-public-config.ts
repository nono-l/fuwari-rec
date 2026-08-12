import { createFileRoute } from "@tanstack/react-router";
import { getCanonicalAuthOrigin } from "@/lib/auth/server";

/**
 * Public, non-secret auth config for the browser (custom-domain handoff).
 * Never expose client secrets here.
 */
export const Route = createFileRoute("/api/auth-public-config")({
  server: {
    handlers: {
      GET: () => {
        const body = JSON.stringify({
          canonicalOrigin: getCanonicalAuthOrigin(),
        });
        return new Response(body, {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
