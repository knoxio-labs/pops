import { cn } from '@pops/ui';

import { DockGroupLabel, DockRow, DockTool } from './dock-parts';
import { APP_ACCENTS, themeClasses, themeLabel, type CanvasTheme } from './theme';

/**
 * A swatch painted by the product's own tokens for a given theme: the
 * wrapper carries the theme classes, so `bg-app-accent` and `bg-background`
 * inside it resolve to that theme's values whatever the chrome is showing.
 */
function Swatch({ theme }: { theme: CanvasTheme }) {
  return (
    <span aria-hidden className={cn('inline-flex', themeClasses(theme))}>
      <span className="flex size-4 items-center justify-center rounded-full border border-border bg-background">
        <span className="size-2 rounded-full bg-app-accent" />
      </span>
    </span>
  );
}

/** Dock tool: the canvas theme — light or dark, and which app accent retints it. */
export function ThemeTool({
  theme,
  onSelect,
}: {
  theme: CanvasTheme;
  onSelect: (theme: CanvasTheme) => void;
}) {
  return (
    <DockTool label={`Canvas theme: ${themeLabel(theme)}`} trigger={<Swatch theme={theme} />}>
      <DockGroupLabel>Mode</DockGroupLabel>
      {(['dark', 'light'] as const).map((mode) => (
        <DockRow
          key={mode}
          current={theme.mode === mode}
          onSelect={() => onSelect({ ...theme, mode })}
          trailing={<Swatch theme={{ ...theme, mode }} />}
        >
          {mode === 'dark' ? 'Dark' : 'Light'}
        </DockRow>
      ))}
      <DockGroupLabel>App accent</DockGroupLabel>
      <DockRow current={theme.accent === undefined} onSelect={() => onSelect({ mode: theme.mode })}>
        None
      </DockRow>
      {APP_ACCENTS.map((accent) => (
        <DockRow
          key={accent}
          current={theme.accent === accent}
          onSelect={() => onSelect({ mode: theme.mode, accent })}
          trailing={<Swatch theme={{ mode: theme.mode, accent }} />}
        >
          {accent}
        </DockRow>
      ))}
    </DockTool>
  );
}
