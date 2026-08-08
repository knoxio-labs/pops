import Testing

@testable import DesignSystem

@Suite("State primitives")
struct StatePrimitiveTests {
    @Test("a usable message survives untouched", arguments: ["Could not reach the server.", "  trimmed  "])
    func messageIsKept(input: String) {
        #expect(StateMessage.resolve(input, fallback: "fallback") == input.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    @Test("a blank message falls back", arguments: ["", " ", "\n", "\t  \n "])
    func blankMessageFallsBack(input: String) {
        #expect(StateMessage.resolve(input, fallback: "fallback") == "fallback")
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
struct SpacingScaleTests {
    @Test("steps ascend, so a larger name is never a smaller gap")
    func scaleAscends() {
        for (smaller, larger) in zip(PopsSpacing.scale, PopsSpacing.scale.dropFirst()) {
            #expect(smaller < larger, "\(smaller) is not smaller than \(larger)")
        }
    }

    @Test("the scale enumerates every declared step")
    func scaleIsComplete() {
        #expect(PopsSpacing.scale == [
            PopsSpacing.zero,
            PopsSpacing.xs,
            PopsSpacing.sm,
            PopsSpacing.md,
            PopsSpacing.lg,
            PopsSpacing.xl,
            PopsSpacing.xxl,
        ])
    }
}
