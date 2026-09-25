# Shell chrome

The global frame every pillar's pages render inside: top bar, app rail, page
nav, mobile sidebar. Each component's header covers its own behaviour and
breakpoints; what follows only spans them.

## Accent colour reaches components through the cascade, not through props

The active pillar's colour is never passed down. `RootLayout` resolves the
active pillar from the URL, turns its declared `color` token into an
`app-<token>` class, and puts that one class on the layout root. The
`.app-*` classes live in `@pops/ui`'s `theme/globals.css` and set
`--app-accent` / `--app-accent-foreground` **and** `--primary` /
`--primary-foreground`, with separate light and dark values. So switching
pillars re-themes both the dedicated `app-accent` utilities and everything
keyed on `--primary` (`bg-primary` buttons) in a single re-render. Focus rings
do not follow — they key on `--ring`, which no `.app-*` class sets.

Consequences worth knowing before editing anything here:

- A pillar that declares no `color` gets **no** class, and the root neutral
  defaults stand. Do not invent a default token.
- `AppRailIcon` applies the same class a second time, per-icon, so each rail
  icon renders in _its own_ pillar's accent rather than the active one's.
  `AmbientBackground` is likewise keyed on `--app-accent`, which is why the
  page glow follows the active pillar.
- `--app-accent` is declared only in `@pops/ui`'s `theme/globals.css`. Nothing
  under this directory assigns it — the layout applies the `app-<token>` class
  name and everything below inherits.

## One install set, four consumers

None of the four consumers holds a nav literal, and they must stay on that
single source or the rail and the router disagree about what is mounted.
Active-state matching goes through `../nav/path-utils`, never a bare
`startsWith`.

## On a phone

Below `md` there is no rail: the hamburger opens `Sidebar`, a modal drawer.
Things that are easy to break without noticing, because every other e2e spec
runs at a desktop viewport (`e2e/shell-mobile.spec.ts` is the phone's):

- **The drawer starts closed and is never persisted.** `uiStore` persists only
  `railOpen`, and its `merge` picks that one key out of storage so a
  `sidebarOpen: true` written by an older build cannot reopen it.
- **Its page list scrolls inside the drawer.** The drawer is a full-height
  flex column; the `nav` is `flex-1 min-h-0 overflow-y-auto`. Drop `min-h-0`
  and the list grows past the screen edge again with nothing to scroll.
- **`useSidebarLifecycle` owns the modal behaviour:** close on Escape, on a
  PUSH or POP route change (not a REPLACE — `/`'s redirect to the first app
  would otherwise shut a drawer opened just before it lands), and when the
  viewport grows past `md` (where the drawer is hidden); lock page scroll only
  while open.
- **It renders outside the `z-10` content layer**, at z-60, so it and its scrim
  cover the z-50 chat button rather than sit beneath it.
- **The top bar's height is `--shell-top-bar-height`** (`styles.css`), which
  includes `env(safe-area-inset-top)`. `index.html` sets `viewport-fit=cover`,
  so the page draws under the notch; everything that clears the bar uses the
  variable, never a bare `3.5rem` / `4rem`.

## What is not here

`SearchInput.tsx` and `MobileSearchOverlay.tsx` are one-line re-exports from
`@pops/navigation`, which owns the search implementation. `AppContextProvider`
is likewise `@pops/navigation`'s — `RootLayout` only mounts it.
