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

## What is not here

`SearchInput.tsx` and `MobileSearchOverlay.tsx` are one-line re-exports from
`@pops/navigation`, which owns the search implementation. `AppContextProvider`
is likewise `@pops/navigation`'s — `RootLayout` only mounts it.
