import Foundation
import Testing

/// Proof that every identifier `ReceiptResultAccessibility` declares is
/// actually attached to a view, not merely a string sitting beside the
/// screen that draws it.
///
/// A declared-but-unattached identifier is worse than no identifier at all —
/// it reads as coverage a Maestro flow could lean on, and fails silently the
/// first time it does. This reads the two files' actual source rather than
/// rendering them, the same technique `ContentViewFeatureSwitchingWiringTests`
/// uses for `ContentView`'s screen table: mounting a `UIHostingController`
/// and walking the live accessibility tree it produces — the only way to
/// prove a modifier reached UIKit rather than merely compiled — needs a
/// connected `UIWindowScene` and at least one settled run-loop pass before
/// SwiftUI actually builds it, and neither this package's own test bundle
/// nor the app's generic test runner produced one reliably enough here to
/// trust. A source-presence check cannot see a modifier applied to the
/// wrong view, but it does catch exactly the failure this suite exists to
/// prevent: a constant declared and then never reached for.
@Suite("Receipt result accessibility wiring")
internal struct ReceiptResultAccessibilityWiringTests {
    /// `.../Tests/FeatureReceiptCaptureTests/ReceiptResultAccessibilityWiringTests.swift`
    private static let sourcesDirectory =
        URL(filePath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .appending(path: "Sources/FeatureReceiptCapture")

    private static func source(_ filename: String) -> String {
        (try? String(contentsOf: sourcesDirectory.appending(path: filename), encoding: .utf8)) ?? ""
    }

    private static let cardSource = source("ReceiptResultCard.swift")
    private static let viewSource = source("ReceiptResultView.swift")

    /// The scan finds real files with real content, or every assertion below
    /// holds just as well for a tree where both were deleted.
    @Test("the scan is reading the real source files")
    func scanIsWiredUp() {
        #expect(!Self.cardSource.isEmpty, "ReceiptResultCard.swift is empty or missing")
        #expect(!Self.viewSource.isEmpty, "ReceiptResultView.swift is empty or missing")
    }

    /// Every distinct outcome `ReceiptResultCard` draws applies its own
    /// identifier — not just declares one nearby, and not the same
    /// identifier as its neighbours, which is exactly the failure mode
    /// `created` / `needsReview` / `unreadable` differing only by copy
    /// creates for anything keying on label text instead.
    @Test(
        "every result-card outcome applies its own identifier",
        arguments: ["created", "needsReview", "unreadable"]
    )
    func everyOutcomeAppliesItsIdentifier(caseName: String) {
        #expect(
            Self.cardSource.contains(
                ".accessibilityIdentifier(ReceiptResultAccessibility.\(caseName))"),
            Comment(
                rawValue: "ReceiptResultAccessibility.\(caseName) is declared but "
                    + "ReceiptResultCard.swift never attaches it with .accessibilityIdentifier(...)"
            )
        )
    }

    @Test("the submitting state applies its own identifier")
    func submittingAppliesItsIdentifier() {
        #expect(
            Self.viewSource.contains(
                ".accessibilityIdentifier(ReceiptResultAccessibility.submitting)"),
            Comment(
                rawValue: "ReceiptResultAccessibility.submitting is declared but "
                    + "ReceiptResultView.swift never attaches it")
        )
    }

    /// The retry control is threaded through `ErrorStateView`'s
    /// `retryAccessibilityIdentifier` parameter rather than a bare
    /// `.accessibilityIdentifier(...)` call — `ErrorStateView` owns the
    /// button, `ReceiptResultView` does not draw it directly.
    @Test("the failed state's retry control applies its own identifier")
    func retryButtonAppliesItsIdentifier() {
        #expect(
            Self.viewSource.contains(
                "retryAccessibilityIdentifier: ReceiptResultAccessibility.retryButton"),
            Comment(
                rawValue: "ReceiptResultAccessibility.retryButton is declared but never passed to "
                    + "ErrorStateView")
        )
    }
}
