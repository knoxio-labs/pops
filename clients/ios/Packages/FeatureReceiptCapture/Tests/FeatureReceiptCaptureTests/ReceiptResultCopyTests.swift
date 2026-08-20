import AppCore
import Foundation
import Testing

@testable import FeatureReceiptCapture

/// The words, and the pairs of them that must never converge.
///
/// A missing `RepositoryError` or `ReceiptGateFailureKind` case is caught by
/// the compiler — both `message(for:)` and `gateFailureLabel(_:)` switch
/// exhaustively. What is checked here is what a compiler cannot see: that the
/// sentences are actually distinct from one another.
@Suite("Receipt result copy")
internal struct ReceiptResultCopyTests {
    private static let everyGatewayFailure: [RepositoryError] = [
        .unavailable,
        .unauthorized,
        .contractMismatch,
        .transport("URLError -1009"),
        .dependencyNotBound,
    ]

    private static let everyGateFailureKind: [ReceiptGateFailureKind] = [
        .unreadableTotal,
        .unreadableLine,
        .noLines,
        .negativeLine,
        .sumMismatch,
        .ambiguousTax,
        .damaged,
        .unrecognised("a-reason-invented-later"),
    ]

    @Test("every gateway failure says something, and no two say the same thing")
    func everyGatewayFailureHasItsOwnSentence() {
        let messages = Self.everyGatewayFailure.map(ReceiptResultCopy.message(for:))

        #expect(messages.allSatisfy { !$0.trimmingCharacters(in: .whitespaces).isEmpty })
        #expect(Set(messages).count == messages.count)
    }

    /// The diagnostic in a transport failure is for a log, not a screen.
    @Test("a transport failure's diagnostic does not reach the reader")
    func diagnosticsStayOutOfCopy() {
        #expect(!ReceiptResultCopy.message(for: .transport("URLError -1009")).contains("-1009"))
    }

    @Test("every gate failure kind says something, and no two say the same thing")
    func everyGateFailureKindHasItsOwnSentence() {
        let labels = Self.everyGateFailureKind.map(ReceiptResultCopy.gateFailureLabel)

        #expect(labels.allSatisfy { !$0.trimmingCharacters(in: .whitespaces).isEmpty })
        #expect(Set(labels).count == labels.count)
    }

    /// `needsReview` and `unreadable` are two different screens with two
    /// different headings, whatever the needs-review message ends up saying
    /// for a given failure set.
    @Test("needs-review and unreadable headings do not read alike")
    func needsReviewIsNotUnreadable() {
        #expect(ReceiptResultCopy.needsReviewHeading != ReceiptResultCopy.unreadableHeading)
        #expect(
            !ReceiptResultCopy.needsReviewMessage(for: [.sumMismatch]).lowercased()
                .contains("couldn't read"))
        #expect(!ReceiptResultCopy.unreadableMessage.lowercased().contains("don't add up"))
    }

    /// The bug this whole file exists to catch: a headline that claims the
    /// receipt's arithmetic was wrong when the gate never said that. Only a
    /// failure set that actually contains `.sumMismatch` may say "add up" —
    /// checked for every one of the other seven kinds individually, and for
    /// every kind paired with a second failure of the same kind (the
    /// Priceline case: two `.damaged` failures, no sum mismatch at all).
    @Test(
        "a needs-review message never blames arithmetic unless the gate reported a sum mismatch",
        arguments: [
            ReceiptGateFailureKind.unreadableTotal,
            .unreadableLine,
            .noLines,
            .negativeLine,
            .ambiguousTax,
            .damaged,
            .unrecognised("a-reason-invented-later"),
        ])
    func onlySumMismatchBlamesArithmetic(_ kind: ReceiptGateFailureKind) {
        #expect(!ReceiptResultCopy.needsReviewMessage(for: [kind]).lowercased().contains("add up"))
        #expect(
            !ReceiptResultCopy.needsReviewMessage(for: [kind, kind]).lowercased()
                .contains("add up"))
    }

    @Test("a sum mismatch does blame the arithmetic")
    func sumMismatchDoesBlameArithmetic() {
        #expect(
            ReceiptResultCopy.needsReviewMessage(for: [.sumMismatch]).lowercased()
                .contains("add up"))
    }

    /// The observed hardware case: two `.damaged` failures and nothing else.
    /// The headline must point at legibility, not arithmetic, and must not
    /// pretend the reader can fix it by re-entering the numbers by hand.
    @Test("two damaged failures read as a legibility problem, not an arithmetic one")
    func damagedReceiptPointsAtARetake() {
        let message = ReceiptResultCopy.needsReviewMessage(for: [.damaged, .damaged])

        #expect(message.lowercased().contains("could not be read"))
        #expect(!message.lowercased().contains("add up"))
    }

    /// Mixing a legibility problem with an arithmetic one must not collapse
    /// into either category's sentence alone — the reader needs to know it
    /// is not just one problem.
    @Test("a mix of failure categories does not pretend to be only one problem")
    func mixedCategoriesDoNotPickOneArbitrarily() {
        let message = ReceiptResultCopy.needsReviewMessage(for: [.sumMismatch, .damaged])

        #expect(message != ReceiptFailureCategory.arithmetic.message)
        #expect(message != ReceiptFailureCategory.unreadable.message)
    }

    /// Every failure kind maps to exactly one category, so a headline never
    /// silently drifts as new kinds are added — the compiler enforces the
    /// switch is exhaustive, this proves the three buckets are distinct.
    @Test("every gate failure kind resolves to a message, and the three categories differ")
    func everyCategoryHasItsOwnMessage() {
        let messages: Set<String> = [
            ReceiptFailureCategory.unreadable.message,
            ReceiptFailureCategory.arithmetic.message,
            ReceiptFailureCategory.other.message,
        ]
        #expect(messages.count == 3)
    }

    @Test("created does not read like either failure outcome")
    func createdIsNotAFailureOutcome() {
        #expect(ReceiptResultCopy.createdHeading != ReceiptResultCopy.needsReviewHeading)
        #expect(ReceiptResultCopy.createdHeading != ReceiptResultCopy.unreadableHeading)
    }

    @Test("a re-upload of the same bytes is not called a duplicate purchase")
    func alreadyStoredIsNotADuplicateClaim() {
        #expect(ReceiptResultCopy.createdMessage != ReceiptResultCopy.createdAlreadyStoredMessage)
        #expect(!ReceiptResultCopy.createdAlreadyStoredMessage.lowercased().contains("duplicate"))
    }

    @Test("a positive delta and a negative delta read differently")
    func deltaSignIsAudible() {
        #expect(ReceiptResultCopy.deltaCents(-250) != ReceiptResultCopy.deltaCents(250))
        #expect(ReceiptResultCopy.deltaCents(-250).contains("short"))
        #expect(ReceiptResultCopy.deltaCents(250).contains("over"))
    }

    @Test("the delta is expressed to two decimal places, not raw cents")
    func deltaIsInMajorUnits() {
        #expect(ReceiptResultCopy.deltaCents(-137) == "1.37 short of the total")
    }

    @Test("a single photo is not called photos")
    func singularPhotoCount() {
        #expect(ReceiptResultCopy.photoCount(1) == "From 1 photo.")
        #expect(ReceiptResultCopy.photoCount(2) == "From 2 photos.")
    }

    @Test("the reference names the purchase it points at")
    func referenceNamesThePurchase() {
        #expect(ReceiptResultCopy.purchaseReference("purchase-42").contains("purchase-42"))
    }

    /// The producer's vocabulary is for its own logs. A reader shown
    /// `negative-shipping` has been taught nothing about their receipt, and
    /// the gate's `detail` is drawn beside this to say what actually happened.
    @Test("an unrecognised gate reason does not leak the wire code to the reader")
    func unrecognisedKindDoesNotShowItsWireCode() {
        let label = ReceiptResultCopy.gateFailureLabel(.unrecognised("negative-shipping"))

        #expect(!label.contains("negative-shipping"))
        #expect(!label.trimmingCharacters(in: .whitespaces).isEmpty)
    }

    /// Two kinds the gate can produce today. A build with no phrasing for one
    /// falls back to the generic sentence, which is survivable; two DIFFERENT
    /// reasons reading identically is not.
    @Test("ambiguous tax does not read like a sum mismatch")
    func ambiguousTaxIsItsOwnReason() {
        #expect(
            ReceiptResultCopy.gateFailureLabel(.ambiguousTax)
                != ReceiptResultCopy.gateFailureLabel(.sumMismatch)
        )
    }

    @Test("the summary reads as one line a reader can check against the paper")
    func summaryReadsAsOneLine() {
        let summary = ReceiptResultCopy.purchaseSummary(
            merchantName: "Woolworths", itemCount: 12, total: "$84.20")

        #expect(summary == "Woolworths · 12 items · $84.20")
    }

    @Test("a summary with nothing but a total is still a sentence, not a stray separator")
    func summaryWithOnlyATotal() {
        let summary = ReceiptResultCopy.purchaseSummary(
            merchantName: nil, itemCount: 0, total: "$1.99")

        #expect(summary == "$1.99")
    }
}
