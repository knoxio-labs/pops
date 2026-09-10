/**
 * Projecting a pillar's wire nav declaration into the app-side one.
 *
 * Every pillar used to declare its nav twice — once in
 * `pillars/<id>/app/src/nav.ts` with PascalCase icons, once as a
 * `NavConfigDescriptor` in `pillars/<id>/src/api/manifest.ts` with kebab-case
 * ones. A parity gate made the two literals agree; it did not
 * make the second unnecessary, and two literals kept agreeing only because a
 * guard said so (POPS-3359).
 *
 * `pillars/<id>/src/contract/pages.ts` is the shape this copies: one
 * declaration the contract owns, projected into both consumers, so they cannot
 * disagree in the first place.
 *
 * **Kebab is the declared form and PascalCase the projection**, not the other
 * way round. Two reasons. The wire form is the one a schema validates, so it
 * is the one that should be written out; and PascalCase → kebab is the harder
 * transform, since `Building2` → `building-2` has to split a letter from a
 * digit, where `building-2` → `Building2` only has to join.
 *
 * The projection is type-level as well as runtime, which is the part that
 * matters. The app's `satisfies AppNavConfigShape` checks every icon against
 * `IconName`, and that check is what made the second literal look justified.
 * {@link PascalCase} preserves it — and extends it, because a typo in the
 * contract's kebab spelling now reddens the app build too, which two
 * independent literals never did.
 */
import type { IconName } from './types';

/** `'bar'` → `'Bar'`. Split out because `Capitalize` is not a safe name here. */
type UpperFirst<S extends string> = S extends `${infer H}${infer T}` ? `${Uppercase<H>}${T}` : S;

/**
 * `'bar-chart-3'` → `'BarChart3'`, at the type level.
 *
 * Recursive on the hyphen rather than a lookup table, so a new icon needs no
 * entry anywhere: the transform is the naming convention, and the convention
 * is what `iconMap`'s keys already follow.
 */
export type PascalCase<S extends string> = S extends `${infer H}-${infer T}`
  ? `${UpperFirst<H>}${PascalCase<T>}`
  : UpperFirst<S>;

/** One nav item as the wire declares it. */
export interface WireNavItem {
  readonly path: string;
  readonly label: string;
  readonly labelKey: string;
  readonly icon: string;
}

/** A pillar's nav as the wire declares it — the shape `NavConfigDescriptor` validates. */
export interface WireNavConfig {
  readonly id: string;
  readonly label: string;
  readonly labelKey: string;
  readonly icon: string;
  readonly color?: string;
  readonly basePath: string;
  readonly order?: number;
  readonly items: readonly WireNavItem[];
}

/** The same item with its icon in the form `iconMap` is keyed on. */
export type ProjectedNavItem<T extends WireNavItem> = {
  path: T['path'];
  label: T['label'];
  labelKey: T['labelKey'];
  icon: PascalCase<T['icon']>;
};

/** The same config with every icon projected. `order` is wire-only and does not survive. */
export type ProjectedNavConfig<T extends WireNavConfig> = {
  id: T['id'];
  label: T['label'];
  labelKey: T['labelKey'];
  icon: PascalCase<T['icon']>;
  color: T['color'];
  basePath: T['basePath'];
  items: ProjectedNavItem<T['items'][number]>[];
};

/** `'bar-chart-3'` → `'BarChart3'`, at runtime. The value half of {@link PascalCase}. */
export function pascalCase<S extends string>(kebab: S): PascalCase<S> {
  return kebab
    .split('-')
    .map((part) => (part === '' ? part : `${part.charAt(0).toUpperCase()}${part.slice(1)}`))
    .join('') as PascalCase<S>;
}

/**
 * Project a contract's wire nav declaration into the app-side config.
 *
 * Declare the source `as const` at the call site. Widening it to
 * `NavConfigDescriptor` first would erase the icon literals, and the
 * `PascalCase` projection — the whole reason this keeps the app's compile-time
 * icon safety — would collapse to `string`.
 *
 * `order` is dropped: it says where the rail puts the pillar, which is the
 * shell's business and not the app's.
 */
export function navConfigFromWire<const T extends WireNavConfig>(wire: T): ProjectedNavConfig<T> {
  return {
    id: wire.id,
    label: wire.label,
    labelKey: wire.labelKey,
    icon: pascalCase(wire.icon),
    color: wire.color,
    basePath: wire.basePath,
    items: wire.items.map((item) => ({
      path: item.path,
      label: item.label,
      labelKey: item.labelKey,
      icon: pascalCase(item.icon),
    })),
  } as ProjectedNavConfig<T>;
}

/** Narrowing helper: whether a projected name is one the kit actually ships. */
export type IsIconName<S extends string> = S extends IconName ? true : false;
