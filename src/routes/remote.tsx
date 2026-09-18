import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/remote")({
  component: () => <Outlet />,
  head: () => ({
    meta: [
      { title: "リモコン — Fuwari REC" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "theme-color", content: "#0f766e" },
    ],
  }),
});
