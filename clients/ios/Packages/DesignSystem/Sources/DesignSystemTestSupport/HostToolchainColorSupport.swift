import DesignSystem
import SwiftUI
import Testing

/// Whether this process can tell `popsBackground` apart from itself resolved
/// in the other appearance.
///
/// Some `swift build`/`swift test` build systems copy `Resources/Colors.
/// xcassets` into a package's resource bundle without compiling it — no
/// `actool`, no `Assets.car` — so a colour asset that never compiled resolves
/// to the same missing-asset placeholder everywhere, in every scheme. Any
/// test built on light and dark actually differing — a contrast check, a
/// light/dark rendering comparison, whether it lives here or in a feature
/// package that only consumes `DesignSystem`'s tokens — has no honest answer
/// to give when that is true. `.disabled(if: !colorsAreCompiled, …)` says so
/// instead of reporting a contradiction the code under test never made.
/// Xcode's own `xcodebuild test` — the iOS Simulator lane the rest of the
/// suite runs under — compiles the catalogue either way, so this only ever
/// trips the host-toolchain run.
public enum HostToolchainColorSupport {
    public static let colorsAreCompiled: Bool = {
        var light = EnvironmentValues()
        light.colorScheme = .light
        var dark = EnvironmentValues()
        dark.colorScheme = .dark
        return Color.popsBackground.resolve(in: light) != Color.popsBackground.resolve(in: dark)
    }()
}

extension Trait where Self == ConditionTrait {
    /// `.disabled(if: !HostToolchainColorSupport.colorsAreCompiled, …)`, named
    /// for the precondition rather than the mechanism, and shared so every
    /// suite that needs it says the same thing.
    public static var requiresCompiledColorCatalog: Self {
        .disabled(
            if: !HostToolchainColorSupport.colorsAreCompiled,
            "this host toolchain build system left Colors.xcassets uncompiled — see HostToolchainColorSupport"
        )
    }
}

/// The other answer to the question `.requiresCompiledColorCatalog` asks, and
/// the reason a rendering comparison can be asked to give one.
///
/// Some comparisons between two rasterised screens do not depend on a colour
/// at all — `ReceiptCaptureRenderingTests.problemsAreDrawn` compares a screen
/// against the same screen carrying one extra sentence, and the sentence
/// changes the layout whether or not the palette resolved. Such a test is
/// right not to disable itself on an uncompiled-catalogue host: it has a real
/// answer there. Silence would say the same thing as forgetting, though, so
/// this says it out loud instead.
///
/// It gates nothing and runs nothing. Its whole job is to be visible — in the
/// source to a reviewer, and to `RenderComparisonTraitScanner`, which demands
/// one trait or the other on any test that compares two renders.
public struct ComparisonSurvivesAnUncompiledCatalog: TestTrait, SuiteTrait {}

extension Trait where Self == ComparisonSurvivesAnUncompiledCatalog {
    /// This comparison holds even where `Colors.xcassets` was copied without
    /// being compiled — see ``ComparisonSurvivesAnUncompiledCatalog``.
    public static var comparisonSurvivesAnUncompiledCatalog: Self { .init() }
}
