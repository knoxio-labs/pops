# DesignPlayground

Item detail separates its supporting sections by 24pt. History starts collapsed; its Show/Hide header reveals muted, caret-free event rows while keeping event sheets and the full history reachable.

The iOS design playground: where a phone screen is designed, argued about and
decided, on the device, before anything implements it.

The capture backdrop and shell degradation surfaces embed the public
`PurchasesFlowView` with fictional purchases, matching the app’s navigation root.

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

## Persistent copy earns its space

Supporting copy must add information the surrounding label, count, hierarchy,
or context does not already provide. It earns its place when it does at least
one of these jobs:

- defines a state or scope precisely;
- helps distinguish one destination from another;
- predicts what someone can find or do after an interaction;
- supplies information needed to decide or recover.

Delete copy that merely paraphrases a heading, explains an obvious noun, or
adds brand cadence without helping someone act. Prefer literal state over a
metaphor that needs its own explanation. For example, `3 open containers · 53
items still being packed` communicates more than `3 in motion` followed by a
sentence explaining the metaphor.

Empty states and exceptional moments can carry more voice, but their useful
information and next action still come first. Persistent product UI is not a
landing page; decorative microcopy becomes content noise when it does not
increase information scent.

## Compact by default

Nothing scrolls except a list. A screen composed of fixed parts, a detail, an
action sheet, a form, fits the viewport at the default text size on a 393pt
phone; the accessibility sizes may scroll, Large must not. Two things that
would stack past the fold become a segmented control, a disclosure or a second
screen, never a longer one.

A list scrolls because its length is the data's. Three fixed sections in a
`List` are not a list, and a footer explaining a section is height spent on
words the reader already had. When a surface here scrolls at Large, that is a
finding about the surface, not about the phone.

## It cannot reach a network, by construction

The package depends on `AppCore` and `DesignSystem`. Both declare no
dependencies of their own, and neither contains a client, a store or a
keychain — networking lives in `BFMClient`, which nothing here links. There is
no session to restore, nothing is persisted, and reopening a surface gives you
the conditions its author chose rather than the ones you last left on.

So the app works with the phone in flight mode, and that is a fact about the
package graph rather than a promise: making it false means adding `BFMClient`
to `Package.swift`, which is a change a reviewer sees.

Search fixture results are exposed in 20-match slices, and the purchase archive
advances when its last visible row appears. These small fictional datasets stage
the loading boundary and do not measure row construction, memory use, or
large-result performance.

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

### Inventory type picker screen

Open **Screens → Inventory → Choose item type** for the screen design.
Joao selected explicit focus on 2026-09-29: branches expand in place and
ancestors hide only on request. The screen includes global search, recent
types, and optional photo suggestions. The settled experiment retains three behaviours of one compact
custom tree: Expanded outline retains every ancestor; Automatic focus hides
older levels as a deeper branch opens; Focus when I ask exposes a scope
control on each branch. All types returns to the root, and the focused heading
opens the ancestor menu. Chevrons expand; type labels select. Rows have no
extra vertical padding, retain 44pt minimum touch targets, and grow with text.

The default state opens the picker directly. Cushions branch expanded compares
the same open branch in all variants. The complete rehearsal starts at
Inventory: New item, sample photos, type, name, location, then Create or
Create another (the plus action beside Create in the navigation bar, matching
`FeatureInventory/Form/InventoryItemFormView.swift`). The second draft retains type and location but starts with its
own name and photos. Search covers aliases and ancestor names globally even
when the tree is focused. Every type, including Item, remains selectable. A tap selects and returns to
the draft immediately; Cancel returns without changing the type. Reopening reveals the selected
type, with a checkmark in the tree, recents and search results. Initial opening
expands sparse branches until five options are visible or the catalogue is
exhausted; subsequent collapse remains under user control. Recent types have a separate heading and padded horizontal chips. Type icons
are stored on the fictional type metadata for reuse across views; production
catalogue icon tokens and client mappings are tracked in POPS-5250. Compact rows use
semantic selection tint, SF Symbols and shared motion tokens; Reduce Motion
disables expansion and focus animations.

The first photo starts a simulated suggestion request only while no type is
chosen. Manual selection, dismissal, removing the last photo, and discarding
or saving the draft invalidate the request; stale results never change the
next draft. Suggested, unavailable and manual paths all leave Create usable.
Camera, classification, upload and persistence remain explicit simulations;
this is a picker rehearsal, not the production form's complete property editor.
Reopening the surface resets the session.

The shared search and recents follow Apple's [search guidance](https://developer.apple.com/design/human-interface-guidelines/searching).
The compact tree explores [keeping related destinations nearby](https://www.nngroup.com/articles/menu-design/).
For a real photo suggestion, iOS 27 [Foundation Models image prompting](https://developer.apple.com/documentation/FoundationModels/analyzing-images-with-multimodal-prompting)
can evaluate an image against a supplied catalogue; [model availability](https://developer.apple.com/documentation/FoundationModels/generating-content-and-performing-tasks-with-foundation-models)
must be checked at runtime. Apple's [Vision classifier](https://developer.apple.com/documentation/vision/classifyimagerequest)
instead returns its supported label vocabulary. Neither establishes accuracy
for cover versus insert: candidates need confirmation, an unknown outcome,
and evaluation on representative photos before production use (POPS-5249).

### Guest surfaces

Open **Screens → Guest** for what a guest's phone shows: someone the operator
shared specific finance accounts with. They are drawn in this package rather
than staged from the feature packages, because the app has no guest wording,
entry form or history (POPS-5889) and no receipt strip (POPS-5890). The
unpaired screen and the degradation banner are the app's own views.

A person account stores its balance from the operator's side, where positive
means the guest owes. `GuestPresentation` turns that around: the words carry
the direction and the figure is printed without a sign. The form's Type row
does the same for writing, each option fixing both the stored transaction type
and the sign, so an amount is always typed as a plain positive figure.

The phone adds, edits and attaches. It never deletes an entry, restores one or
removes a saved receipt; a page added in the open form can still be dropped
before saving.

### Build and test

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
