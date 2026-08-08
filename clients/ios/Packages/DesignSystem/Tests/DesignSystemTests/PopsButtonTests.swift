import SwiftUI
import Testing

@testable import DesignSystem

/// `View` conformance makes `PopsButton` main-actor isolated, so its stored
/// closure can only be built and called from there.
@MainActor
@Suite("PopsButton")
internal struct PopsButtonTests {
    @Test("it calls the action it was handed")
    func actionIsInvoked() {
        final class Recorder {
            var count = 0
        }

        let recorder = Recorder()
        let button = PopsButton("Pair") { recorder.count += 1 }

        button.action()
        button.action()

        #expect(recorder.count == 2)
    }

    /// The state the primitive exists to own. SwiftUI's default dimming would
    /// fade the whole subtree including the border, so a caller rolling its own
    /// gets a washed-out outline around full-strength text — this asserts the
    /// two states are genuinely drawn differently rather than trusting that
    /// `isEnabled` is read at all.
    @Test("disabled renders differently from enabled", arguments: ColorScheme.allCases)
    func disabledIsDistinct(scheme: ColorScheme) throws {
        let enabled = try #require(
            PrimitiveRenderingTests.render(PopsButton("Pair") {}, in: scheme))
        let disabled = try #require(
            PrimitiveRenderingTests.render(PopsButton("Pair") {}.disabled(true), in: scheme))

        #expect(enabled != disabled)
    }
}
