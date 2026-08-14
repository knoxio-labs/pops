import SwiftUI

@testable import DesignSystem

/// Whether this process can tell `popsBackground` apart from itself resolved
/// in the other appearance.
///
/// Some `swift build`/`swift test` build systems copy `Resources/Colors.
/// xcassets` into the test bundle without compiling it — no `actool`, no
/// `Assets.car` — so a colour asset that never compiled resolves to the same
/// missing-asset placeholder everywhere, in every scheme. A suite built on
/// light and dark differing has no honest answer to give when that is true;
/// `.disabled(if: !colorsAreCompiled, …)` says so instead of reporting a
/// contradiction the code under test never made. Xcode's own `xcodebuild
/// test` — the iOS Simulator lane the rest of the suite runs under — compiles
/// the catalogue either way, so this only ever trips the host-toolchain run.
internal enum HostToolchainColorSupport {
    internal static let colorsAreCompiled: Bool = {
        var light = EnvironmentValues()
        light.colorScheme = .light
        var dark = EnvironmentValues()
        dark.colorScheme = .dark
        return Color.popsBackground.resolve(in: light) != Color.popsBackground.resolve(in: dark)
    }()
}
