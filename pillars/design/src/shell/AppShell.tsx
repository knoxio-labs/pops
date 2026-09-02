import { useEffect, useState } from 'react';

import { decodeFrame } from '../frames/kind';
import { catalog } from '../registry';
import { Canvas } from './Canvas';
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

/** Sidebar, canvas and dock. Chrome only — the design surface lives in the frame. */
export function AppShell() {
  const [chromeMode, toggleChromeMode] = useChromeMode();
  const [sidebar, setSidebar] = useStoredString(SIDEBAR_KEY, 'open');
  const [themeRaw, setThemeRaw] = useStoredString(CANVAS_THEME_KEY, encodeTheme(DEFAULT_THEME));
  const [viewport, setViewport] = useState<Viewport>(FULL);
  const [frameRaw, setFrameRaw] = useStoredString(CANVAS_FRAME_KEY, 'none');
  const comments = useCommentMode();
  const theme = decodeTheme(themeRaw);
  const frame = decodeFrame(frameRaw);

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
        />
      </main>
      <Dock
        catalog={catalog}
        theme={theme}
        viewport={viewport}
        frame={frame}
        comments={{
          active: comments.active,
          openCount: comments.openCount,
          onToggle: comments.toggle,
        }}
        onThemeSelect={(next) => setThemeRaw(encodeTheme(next))}
        onViewportSelect={setViewport}
        onFrameSelect={setFrameRaw}
      />
    </div>
  );
}
