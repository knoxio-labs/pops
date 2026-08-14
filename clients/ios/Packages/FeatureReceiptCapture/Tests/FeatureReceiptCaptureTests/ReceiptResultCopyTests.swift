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
        .damaged,
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

    /// The distinction the whole ticket rests on: `needsReview` is "we read
    /// it and the numbers don't add up," `unreadable` is "we couldn't read
    /// it at all." A generic apology here is exactly the failure POPS-1961
    /// names.
    @Test("needs-review and unreadable do not read alike")
    func needsReviewIsNotUnreadable() {
        #expect(ReceiptResultCopy.needsReviewHeading != ReceiptResultCopy.unreadableHeading)
        #expect(ReceiptResultCopy.needsReviewMessage != ReceiptResultCopy.unreadableMessage)
        #expect(!ReceiptResultCopy.needsReviewMessage.lowercased().contains("couldn't read"))
        #expect(!ReceiptResultCopy.unreadableMessage.lowercased().contains("don't add up"))
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
}
