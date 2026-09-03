import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router';

import { decodeFrame } from '../frames/kind';
import { catalog } from '../registry';
import { parseAddress, type Address } from './address';
import { Canvas } from './Canvas';
import { declaredFrame, surfaceKeyOf } from './declared-frame';
import { Dock } from './Dock';
import { Sidebar } from './Sidebar';
import { useStoredString } from './storage';
import {
  applyThemeToDocument,
  decodeTheme,
  DEFAULT_THEME,
  encodeTheme,
  type ThemeMode,
} from './theme';
import { useCommentMode } from './use-comment-mode';
import { FULL, type Viewport } from './viewport';

import type { FrameKind } from '../frames/kind';

const CHROME_MODE_KEY = 'pops-design-chrome-mode';
const CANVAS_THEME_KEY = 'pops-design-canvas-theme';
const CANVAS_FRAME_KEY = 'pops-design-canvas-frame';
const SIDEBAR_KEY = 'pops-design-sidebar';

/** The chrome follows its own light/dark preference, independent of the canvas. */
function useChromeMode(): [ThemeMode, () => void] {
  const [raw, setRaw] = useStoredString(CHROME_MODE_KEY, 'dark');
  const mode: ThemeMode = raw === 'light' ? 'light' : 'dark';
  useEffect(() => {
    applyThemeToDocument(document, { mode });
  }, [mode]);
  return [mode, () => setRaw(mode === 'dark' ? 'light' : 'dark')];
}

/**
 * Which product chrome the canvas draws, and how choosing one behaves.
 *
 * Resolved during render rather than in an effect: the iframe's initial `src`
 * carries the frame, so a frame decided after mount would load the surface
 * bare and only then tell it to grow a phone around itself.
 *
 * What a surface declares wins on arrival; a frame picked by hand wins for as
 * long as you stay on that surface; anything else keeps the last frame you
 * chose, which is what the stored preference is.
 */
function useCanvasFrame(address: Address | null): [FrameKind, (frame: FrameKind) => void] {
  const [frameRaw, setFrameRaw] = useStoredString(CANVAS_FRAME_KEY, 'none');
  const [chosen, setChosen] = useState<{ surface: string; frame: FrameKind } | null>(null);
  const surface = surfaceKeyOf(address);
  const frame =
    chosen?.surface === surface
      ? chosen.frame
      : (declaredFrame(catalog, address) ?? decodeFrame(frameRaw));
  const select = useCallback(
    (next: FrameKind) => {
      setChosen({ surface, frame: next });
      setFrameRaw(next);
    },
    [setFrameRaw, surface]
  );
  return [frame, select];
}

/** Sidebar, canvas and dock. Chrome only — the design surface lives in the frame. */
export function AppShell() {
  const [chromeMode, toggleChromeMode] = useChromeMode();
  const [sidebar, setSidebar] = useStoredString(SIDEBAR_KEY, 'open');
  const [themeRaw, setThemeRaw] = useStoredString(CANVAS_THEME_KEY, encodeTheme(DEFAULT_THEME));
  const [viewport, setViewport] = useState<Viewport>(FULL);
  const [dismissToken, setDismissToken] = useState(0);
  const comments = useCommentMode();
  const theme = decodeTheme(themeRaw);
  const location = useLocation();
  const address = parseAddress(location.pathname, location.search);
  const [frame, onFrameSelect] = useCanvasFrame(address);

  // A press on the design is a press outside the dock; the shell's document
  // never sees it, because the canvas is an iframe.
  const onSurfacePointerDown = useCallback(() => {
    setDismissToken((token) => token + 1);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar
        catalog={catalog}
        collapsed={sidebar === 'collapsed'}
        onToggle={() => setSidebar(sidebar === 'collapsed' ? 'open' : 'collapsed')}
        chromeMode={chromeMode}
        onToggleChromeMode={toggleChromeMode}
      />
      <main className="relative min-w-0 flex-1 overflow-hidden">
        <Canvas
          theme={theme}
          viewport={viewport}
          frame={frame}
          comments={comments}
          onResize={(w, h) => setViewport({ kind: 'fixed', label: 'Custom', w, h })}
          onSurfacePointerDown={onSurfacePointerDown}
        />
      </main>
      <Dock
        catalog={catalog}
        theme={theme}
        viewport={viewport}
        frame={frame}
        dismissToken={dismissToken}
        comments={{
          active: comments.active,
          openCount: comments.openCount,
          onToggle: comments.toggle,
        }}
        onThemeSelect={(next) => setThemeRaw(encodeTheme(next))}
        onViewportSelect={setViewport}
        onFrameSelect={onFrameSelect}
      />
    </div>
  );
}
