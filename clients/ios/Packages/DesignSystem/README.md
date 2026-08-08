# DesignSystem

Every colour, type size and gap in the iOS app resolves through this package.

That is the entire point of it. The real visual design is being produced elsewhere and has not landed; when it does, it should be one diff against `Sources/DesignSystem/Resources/Colors.xcassets` and the scales in `Sources/DesignSystem/Tokens/`, not a sweep through every screen. Nothing here is a visual decision worth defending — the values are deliberately plain, and none of them is a claim about what the app will look like.

## The two rules

Both apply to every module under `Packages/`, not just to this one.

**A feature may not name a colour, a type size or a gap.** Not `Color.red`, not `#0B5FD0`, not `.padding(16)`, not `.font(.system(size: 17))`. If a token is missing, add it here and use it there. Inlining it at the call site is the specific failure this package exists to prevent, because it survives review, compiles, looks right, and is invisible until the redesign misses it.

**Type comes from the scale, never from a point size.** The `Font` tokens are built from `Font.TextStyle`, which is what makes Dynamic Type work. A fixed point size opts that screen out of accessibility silently — it renders correctly for whoever wrote it, at their text size, on their device.

`DesignSystemTests` enforces the first rule by scanning this package's own `Sources` (`TokenDisciplineScanner`), and self-tests against planted violations so it cannot pass vacuously. Its reach stops at the package boundary — a test target cannot see a sibling package — so nothing yet enforces either rule inside a feature module (POPS-1432).

## Light and dark diverge in the asset catalogue, and nowhere else

Each colour token is one `.colorset` carrying a light and a dark appearance. No call site branches on `colorScheme`, and no view has a dark-mode variant. Adding a colour means adding a colorset; there is no other correct place to put one.

Asset-catalogue lookup is by name and fails soft: a misspelled or absent colorset still renders, it just renders the same colour in both schemes. `ColorTokenTests` resolves every token under both schemes and fails when they match, which is the only signal that distinguishes a wired-up token from a silently broken one. `ContrastTests` then measures every foreground token against every surface it is allowed to sit on and holds it to WCAG AA for body text, so a later colour change cannot quietly become unreadable.

## Previews

Every `#Preview` renders through `ColorSchemePreview`, which stacks its content once per colour scheme. A preview written in whichever scheme its author happened to be running is how a dark-mode regression ships.

Xcode's canvas is the only place a human sees a preview, and nothing automated opens it. `PrimitiveRenderingTests` rasterises the same views with `ImageRenderer` instead: it renders each one twice in light to establish the render is deterministic, then asserts light and dark differ.

## Building and testing it

`swift build` and `swift test` compile for the **host**, not for iOS — which is why `Package.swift` lists `.macOS` alongside `.iOS`. The module ships in an iOS app and nothing else. An iOS-only regression is therefore not caught here; it is caught by building the app (`mise run build` in `clients/ios`), and running these tests against the iOS SDK is part of the iOS CI job (POPS-1376).
