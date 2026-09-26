import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UIState {
  /**
   * The mobile (<768px) navigation drawer. Starts closed and is never
   * persisted: it is a modal overlay, and restoring it open meant a phone
   * landed on a drawer covering the page on every load.
   */
  sidebarOpen: boolean;
  railOpen: boolean;
  pageNavOpen: boolean;
  /**
   * Open state for each installed overlay, keyed by module id, so the shell can
   * mount any registered overlay without growing a new field per module.
   */
  overlays: Record<string, boolean>;
  /**
   * When true, the next location-change close of the PageNav overlay is
   * suppressed. Used by AppRail to prevent the navigation it triggers from
   * immediately collapsing the overlay it is about to open.
   */
  skipNextPageNavClose: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleRail: () => void;
  setRailOpen: (open: boolean) => void;
  togglePageNav: () => void;
  setPageNavOpen: (open: boolean) => void;
  setSkipNextPageNavClose: (skip: boolean) => void;
  toggleOverlay: (moduleId: string) => void;
  setOverlayOpen: (moduleId: string, open: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: false,
      railOpen: true,
      pageNavOpen: false,
      overlays: {},
      skipNextPageNavClose: false,
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleRail: () => set((state) => ({ railOpen: !state.railOpen })),
      setRailOpen: (open) => set({ railOpen: open }),
      togglePageNav: () => set((state) => ({ pageNavOpen: !state.pageNavOpen })),
      setPageNavOpen: (open) => set({ pageNavOpen: open }),
      setSkipNextPageNavClose: (skip) => set({ skipNextPageNavClose: skip }),
      toggleOverlay: (moduleId) =>
        set((state) => ({
          overlays: { ...state.overlays, [moduleId]: !(state.overlays[moduleId] ?? false) },
        })),
      setOverlayOpen: (moduleId, open) =>
        set((state) => ({ overlays: { ...state.overlays, [moduleId]: open } })),
    }),
    {
      name: 'pops-ui-storage',
      partialize: (state) => ({ railOpen: state.railOpen }),
      // Pick `railOpen` out of what was stored rather than spreading it: an
      // older build persisted `sidebarOpen: true`, and the default shallow
      // merge would keep reopening the drawer from that stale entry.
      merge: (persisted, current) => {
        const railOpen = (persisted as Partial<UIState> | undefined)?.railOpen;
        return typeof railOpen === 'boolean' ? { ...current, railOpen } : current;
      },
    }
  )
);
