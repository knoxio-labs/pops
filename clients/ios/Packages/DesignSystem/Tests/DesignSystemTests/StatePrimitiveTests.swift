import CoreGraphics
import Foundation
import Testing

@testable import DesignSystem

@Suite("State primitives")
internal struct StatePrimitiveTests {
    @Test(
        "a usable message survives untouched",
        arguments: ["Could not reach the server.", "  trimmed  "])
    func messageIsKept(input: String) {
        #expect(
            StateMessage.resolve(input, fallback: "fallback")
                == input.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    @Test("a blank message falls back", arguments: ["", " ", "\n", "\t  \n "])
    func blankMessageFallsBack(input: String) {
        #expect(StateMessage.resolve(input, fallback: "fallback") == "fallback")
    }

    /// `StateMessage.resolve` having a fallback is not the same claim as
    /// `ErrorStateView` routing its two caller-supplied strings through it,
    /// and the wiring is the half that can be deleted by accident.
    ///
    /// Asserted as copy rather than by rendering the screen with a blank
    /// title, rendering it with none, and comparing the images: that
    /// comparison holds on a build system that copied `Colors.xcassets`
    /// without compiling it whether or not the fallback exists, because both
    /// canvases are then the same placeholder colour — see
    /// `HostToolchainColorSupport`. Two strings are two strings on every lane.
    @MainActor
    @Test("ErrorStateView falls back for blank copy", arguments: ["", "   ", "\n\t"])
    func blankCopyFallsBack(blank: String) {
        let view = ErrorStateView(message: blank, retryTitle: blank) {}

        #expect(view.resolvedMessage == ErrorStateView.fallbackMessage)
        #expect(view.resolvedRetryTitle == ErrorStateView.fallbackRetryTitle)
    }

    @MainActor
    @Test("ErrorStateView keeps the copy it was handed")
    func suppliedCopyIsKept() {
        let view = ErrorStateView(
            message: "Could not reach the server.", retryTitle: "Réessayer", retry: {})

        #expect(view.resolvedMessage == "Could not reach the server.")
        #expect(view.resolvedRetryTitle == "Réessayer")
    }

    // `View` conformance makes `ErrorStateView` main-actor isolated, so its
    // stored closure can only be built and called from there.
    @MainActor
    @Test("ErrorStateView calls the retry closure it was handed")
    func retryIsInvoked() {
        final class Recorder {
            var count = 0
        }

        let recorder = Recorder()
        let view = ErrorStateView(message: "boom") { recorder.count += 1 }

        view.retry()
        view.retry()

        #expect(recorder.count == 2)
    }
}

@Suite("Spacing scale")
internal struct SpacingScaleTests {
    @Test("steps ascend, so a larger name is never a smaller gap")
    func scaleAscends() {
        let steps: [(name: String, value: CGFloat)] = [
            ("zero", PopsSpacing.zero),
            ("xs", PopsSpacing.xs),
            ("sm", PopsSpacing.sm),
            ("md", PopsSpacing.md),
            ("lg", PopsSpacing.lg),
            ("xl", PopsSpacing.xl),
            ("xxl", PopsSpacing.xxl),
        ]

        for (smaller, larger) in zip(steps, steps.dropFirst()) {
            #expect(
                smaller.value < larger.value,
                "\(smaller.name) (\(smaller.value)) is not smaller than \(larger.name) (\(larger.value))"
            )
        }
    }
}
