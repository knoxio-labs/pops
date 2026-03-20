/**
 * Root layout - top bar + sidebar + content area
 *
 * Responsive behaviour:
 * - Desktop (≥768px): Sidebar pushes content with left margin
 * - Mobile (<768px): Content is always full-width; sidebar overlays
 */
import { Outlet } from "react-router";
import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";
import { ErrorBoundary } from "@pops/ui";
import { useUIStore } from "@/store/uiStore";

export function RootLayout() {
  const sidebarOpen = useUIStore((state) => state.sidebarOpen);

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <div className="flex">
        <Sidebar open={sidebarOpen} />
        <main
          className={`flex-1 transition-all duration-300 min-w-0 ${
            sidebarOpen ? "md:ml-64" : "ml-0"
          }`}
        >
          <ErrorBoundary>
            <div className="p-4 md:p-6">
              <Outlet />
            </div>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
