/**
 * AI app route definitions and navigation config
 *
 * Routes are lazy-loaded for code splitting. The shell imports
 * these via @pops/app-ai and mounts them under /ai/*.
 */
import { lazy } from "react";
import type { RouteObject } from "react-router";

const AiUsagePage = lazy(() =>
  import("./pages/AiUsagePage").then((m) => ({ default: m.AiUsagePage })),
);

/** Local type mirror for compile-time safety (shell owns the canonical types). */
interface AppNavConfigShape {
  id: string;
  label: string;
  icon: string;
  color?: string;
  basePath: string;
  items: { path: string; label: string; icon: string }[];
}

export const navConfig = {
  id: "ai",
  label: "AI",
  icon: "Bot",
  color: "violet",
  basePath: "/ai",
  items: [{ path: "", label: "Usage", icon: "BarChart3" }],
} satisfies AppNavConfigShape;

export const routes: RouteObject[] = [
  { index: true, element: <AiUsagePage /> },
];
