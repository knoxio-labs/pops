/**
 * The canvas theme is the product's own token layer, not a playground
 * invention: `.dark` from `@pops/ui/theme` selects the dark values, and one
 * of the `.app-*` accent classes retints `--app-accent` and `--primary` the
 * way the shell does per pillar. There is nothing else to switch.
 */
export const APP_ACCENTS = ['emerald', 'indigo', 'amber', 'rose', 'sky', 'violet'] as const;
export type AppAccent = (typeof APP_ACCENTS)[number];

export type ThemeMode = 'light' | 'dark';

export interface CanvasTheme {
  mode: ThemeMode;
  accent?: AppAccent;
}

/** POPS is dark-first (AGENTS.md, Design Context). */
export const DEFAULT_THEME: CanvasTheme = { mode: 'dark' };

function isAccent(value: string): value is AppAccent {
  return (APP_ACCENTS as readonly string[]).includes(value);
}

/** `dark`, or `dark+emerald` — the form the frame URL and storage carry. */
export function encodeTheme(theme: CanvasTheme): string {
  return theme.accent ? `${theme.mode}+${theme.accent}` : theme.mode;
}

/** Tolerant inverse of {@link encodeTheme}: anything unrecognised is the default. */
export function decodeTheme(raw: string | null | undefined): CanvasTheme {
  if (!raw) return DEFAULT_THEME;
  const [mode, accent] = raw.split('+');
  if (mode !== 'light' && mode !== 'dark') return DEFAULT_THEME;
  return accent && isAccent(accent) ? { mode, accent } : { mode };
}

/** The class names that realise a theme on an element's subtree. */
export function themeClasses(theme: CanvasTheme): string[] {
  const classes: string[] = [];
  if (theme.mode === 'dark') classes.push('dark');
  if (theme.accent) classes.push(`app-${theme.accent}`);
  return classes;
}

export function themeLabel(theme: CanvasTheme): string {
  const mode = theme.mode === 'dark' ? 'Dark' : 'Light';
  return theme.accent ? `${mode} · ${theme.accent}` : mode;
}

/**
 * Apply a theme to a whole document (the frame's, or the chrome's): clear
 * every theme class first so a mode or accent switch never stacks.
 */
export function applyThemeToDocument(doc: Document, theme: CanvasTheme): void {
  const root = doc.documentElement;
  for (const cls of [...root.classList]) {
    if (cls === 'dark' || cls.startsWith('app-')) root.classList.remove(cls);
  }
  root.classList.add(...themeClasses(theme));
}
