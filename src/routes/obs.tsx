import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ObsOverlayView } from "@/components/editor/obs-overlay-view";

export const Route = createFileRoute("/obs")({
  component: ObsPage,
  head: () => ({
    meta: [
      { title: "OBS — Fuwari REC" },
      { name: "theme-color", content: "#000000" },
    ],
  }),
});

function ObsPage() {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    html.style.background = "transparent";
    body.style.background = "transparent";
    html.classList.add("obs-overlay");
    return () => {
      html.style.background = "";
      body.style.background = "";
      html.classList.remove("obs-overlay");
    };
  }, []);
  return <ObsOverlayView />;
}
