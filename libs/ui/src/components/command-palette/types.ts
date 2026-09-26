import type { LucideIcon } from 'lucide-react';

/** A command-palette entry supplied by the caller. */
export interface PaletteCommand {
  id: string;
  label: string;
  /** Which section this entry belongs to; the caller's sections decide order and titles. */
  group: string;
  icon: LucideIcon;
  /** Extra words a query may match: codes, paths, synonyms. */
  keywords?: readonly string[];
  detail?: string;
  /** Present when choosing the entry opens an argument step instead of running it. */
  argument?: string;
}

/** One argument step currently waiting for a choice. */
export interface PaletteStep {
  commandId: string;
  label: string;
  argument: string;
}

/** One caller-defined group in the palette result list. */
export interface PaletteSection<C extends PaletteCommand = PaletteCommand> {
  id: string;
  title: string;
  entries: C[];
}

/** One scope available to the palette's Tab cycle. */
export interface PaletteScopeOption {
  id: string;
  label: string;
}

/** Loading or failure state for the current query and scope. */
export type PaletteStatus = 'ready' | 'pending' | { error: string };

/** All data and derivation callbacks needed by a command palette. */
export interface PaletteSource<C extends PaletteCommand = PaletteCommand> {
  /** At least one scope; Tab cycles these in this order and the first is the default. */
  scopes: readonly PaletteScopeOption[];
  /** Every runnable command; a step's command is resolved here by id. */
  commands: readonly C[];
  /** Sections to render in order, already ranked and capped, with empty ones omitted. */
  sections: (query: string, scope: string, step: PaletteStep | null) => PaletteSection<C>[];
  /** The hand-off row drawn last, or null. */
  seeAll?: (query: string, scope: string, step: PaletteStep | null) => C | null;
  /** Placeholder text for the current scope and argument step. */
  placeholder: (scope: string, step: PaletteStep | null) => string;
  /** Omitted means that the source is ready. */
  status?: (query: string, scope: string, step: PaletteStep | null) => PaletteStatus;
}

/** Query, active scope and the stack of argument steps. */
export interface PaletteState {
  query: string;
  scope: string;
  steps: readonly PaletteStep[];
}

/** A state transition owned by the palette. */
export type PaletteAction =
  | { type: 'query'; query: string }
  | { type: 'cycle-scope'; scopes: readonly string[] }
  | { type: 'push'; command: PaletteCommand }
  | { type: 'pop' }
  | { type: 'reset'; scope: string };

/** The result of handing a keyboard key to the palette. */
export interface PaletteKeyOutcome {
  action: PaletteAction | null;
  /** Whether the palette owns the key and the browser default should be prevented. */
  handled: boolean;
  /** Whether the palette should be dismissed. */
  close: boolean;
}

/** The result of choosing an entry: open an argument step or run a command. */
export type PaletteChoice<C extends PaletteCommand = PaletteCommand> =
  | { kind: 'step' }
  | { kind: 'run'; command: C; argument: C | null };

/** The state and actions exposed by {@link usePaletteState}. */
export interface PaletteApi<C extends PaletteCommand = PaletteCommand> {
  state: PaletteState;
  sections: PaletteSection<C>[];
  step: PaletteStep | null;
  seeAll: C | null;
  status: PaletteStatus;
  setQuery: (query: string) => void;
  cycleScope: () => void;
  /** Applies a palette-owned key and reports whether it was handled or closes the palette. */
  onKey: (key: string) => { handled: boolean; close: boolean };
  choose: (entry: C) => PaletteChoice<C>;
}
