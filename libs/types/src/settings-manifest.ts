/**
 * Settings manifest types — shared between API (registry) and frontend (renderer).
 */

export type SettingsFieldType =
  | 'text'
  | 'number'
  | 'toggle'
  | 'select'
  | 'password'
  | 'url'
  | 'duration'
  | 'json';

export interface SettingsField {
  key: string;
  label: string;
  description?: string;
  type: SettingsFieldType;
  default?: string;
  options?: { value: string; label: string }[];
  validation?: {
    required?: boolean;
    min?: number;
    max?: number;
    pattern?: string;
    message?: string;
  };
  envFallback?: string;
  sensitive?: boolean;
  requiresRestart?: boolean;
  testAction?: {
    procedure: string;
    label: string;
  };
  /** Load options dynamically from a tRPC query procedure. The procedure must return `{ data: Record<string, unknown>[] }`. */
  optionsLoader?: {
    procedure: string;
    valueKey: string;
    labelKey: string;
  };
}

/**
 * A pillar-owned React widget mounted inside a settings group, for flows the
 * declarative field renderer cannot express (an OAuth-style handshake, a
 * device pairing dance). Mirrors `ModuleCaptureOverlayConfig.bundleSlot`: the
 * manifest names a kebab-case slot and the shell's workspace bundle map
 * resolves it to the component the owning pillar exports. Wire-shaped, so a
 * section discovered over the live registry carries it unchanged.
 */
export interface SettingsWidget {
  /** Kebab-case slot identifier the shell's bundle map resolves to a component. */
  bundleSlot: string;
}

export interface SettingsGroup {
  id: string;
  title: string;
  description?: string;
  fields: SettingsField[];
  /**
   * Mounts a pillar-owned component above this group's fields. A group may
   * carry a widget, fields, or both; an unresolvable slot degrades to the
   * fields alone rather than failing the section.
   */
  widget?: SettingsWidget;
}

export interface SettingsManifest {
  id: string;
  title: string;
  icon?: string;
  order: number;
  groups: SettingsGroup[];
}
