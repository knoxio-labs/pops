# DesignPlayground

The iOS design playground: where a phone screen is designed, argued about and
decided, on the device, before anything implements it.

It is the native half of a pair. `pillars/design` is the web playground and
owns every screen the browser draws; this owns every screen the phone draws.
The split is not tidiness — it is the whole point, and the reason it exists is
worth stating plainly.

## Why this is not a frame in the web playground

`pillars/design` grew an iPhone frame: a 393×852 device, colour tokens
generated from `Colors.xcassets`, a type scale hand-mapped from `PopsFont`, and
HTML facsimiles named after the Swift primitives. It is careful work and it was
never going to be enough, because the half of an iOS screen the _system_ draws
cannot be drawn in CSS:

- **Glass.** In iOS 26 the navigation bar, the tab bar and the search field are
  Liquid Glass, and glass refracts what is behind it and tracks device motion.
  `backdrop-filter` is a blur. The web technique that comes closest —
  `feDisplacementMap` behind `backdrop-filter` — is Chromium-only, so it shows
  nothing in Safari, on the hardware the design is for.
- **Dynamic Type.** A `Font.TextStyle` has no point size until the system
  resolves one against the reader's setting, so `type-scale.css` pins every
  size at Large. The accessibility sizes, which is where iOS layouts actually
  break, could not be reviewed at all. Here they are a slider.
- **Chrome.** A `NavigationStack` brings a bar, a scroll-edge treatment and a
  large title that collapses; a `TabView` brings a bar that floats over
  content; a sheet brings detents and a grabber. Approximating them means
  reviewing a drawing of the platform rather than the platform.

Everything here is the real thing, because it is the same Swift the app ships.

## The four kinds

| Kind               | What it is                                                |
| ------------------ | --------------------------------------------------------- |
| `DesignSurface`    | A page, in every condition worth looking at (its states)  |
| `DesignComponent`  | One DesignSystem control, in every shape it comes in      |
| `DesignExperiment` | A question about a surface, and the variants answering it |
| Tokens             | Every colour and text style, as the device resolves them  |

All four are drawn by one `StageView`, because a component and an experiment
are both "a thing with several shapes worth switching between", which is what a
surface's states already are. `Contract/Staging.swift` is that mapping.

## The inspector

The controls float over the surface rather than beside it, so a screen designed
for 393pt is reviewed at 393pt. They change the state, the `Chrome`, the
appearance, the layout direction, and the Dynamic Type size.

It is **draggable**, and that is not a flourish. It floats at the bottom edge
and so does everything iOS 26 puts there — a tab bar, and on iPhone the search
field, which moved to the bottom in 26. Which of them is underneath depends on
the surface and the chrome, and every fixed offset collides with some
combination. Letting it be moved is smaller than being clever and it is right
in every case.

The overrides are applied to the surface, not to the cover, so the inspector
stays readable while the surface is at AX5 in dark.

## It cannot reach a network, by construction

The package depends on `AppCore` and `DesignSystem`. Both declare no
dependencies of their own, and neither contains a client, a store or a
keychain — networking lives in `BFMClient`, which nothing here links. There is
no session to restore, nothing is persisted, and reopening a surface gives you
the conditions its author chose rather than the ones you last left on.

So the app works with the phone in flight mode, and that is a fact about the
package graph rather than a promise: making it false means adding `BFMClient`
to `Package.swift`, which is a change a reviewer sees.

## The catalogue is a list, and a test guards it

`Catalog.swift` names every surface, component and experiment. The web
playground discovers screens with `import.meta.glob`; Swift has no runtime
globbing, so this is a hand-written list and a surface not on it does not
appear.

`CatalogTests` is what keeps that from being silent — unique ids, no empty
states, an experiment with at least two answers, a recorded decision naming a
variant that exists, a subject that is a real surface. Each of those fails on a
catalogue somebody has broken.

## Running it

`PopsPlayground` is its own app target and its own installable app, sharing the
DesignSystem with `Pops` and sharing nothing else — so what lands on a
reviewer's phone carries no pairing, no keychain entry and no BFM host.

```
mise -C clients/ios run generate
xcodebuild -project clients/ios/Pops.xcodeproj -scheme PopsPlayground \
  -destination 'platform=iOS Simulator,name=iPhone 17' build
```

The package's own tests run on the host with no Xcode:
`swift test --package-path clients/ios/Packages/DesignPlayground`. They also
run inside `mise run test`, because `DesignPlaygroundTests` is named in the
`Pops` scheme's testables — a package under `Packages/` with a `Tests/` and no
entry there fails that lane.
