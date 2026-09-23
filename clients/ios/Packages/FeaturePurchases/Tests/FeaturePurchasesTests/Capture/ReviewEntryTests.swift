import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeaturePurchases

@Suite("Purchase review entries")
internal struct ReviewEntryTests {
    @Test("unreadable receipts lead while each outcome keeps arrival order")
    func unreadableFirst() {
        let rows = [
            row(id: "read-1", outcome: .read(reading(reconciled: true)), byte: 1),
            row(id: "unreadable-1", outcome: .unreadable(reason: "blank"), byte: 2),
            row(id: "read-2", outcome: .read(reading(reconciled: true)), byte: 3),
            row(id: "unreadable-2", outcome: .unreadable(reason: "blurred"), byte: 4),
        ]

        let entries = ReviewEntry.batch(from: rows)

        #expect(entries.map(\.id) == ["unreadable-1", "unreadable-2", "read-1", "read-2"])
        #expect(entries.map { $0.parts[0].data.first } == [2, 4, 1, 3])
    }

    @Test("only an unreconciled reading carries the needs-review warning")
    func readingStatus() {
        let reconciled = reading(reconciled: true)
        let unreconciled = reading(reconciled: false)

        let entries = ReviewEntry.batch(from: [
            row(id: "reconciled", outcome: .read(reconciled), byte: 1),
            row(id: "unreconciled", outcome: .read(unreconciled), byte: 2),
        ])

        #expect(entries[0].status == nil)
        #expect(
            entries[1].status
                == ReceiptDraftView.Status(
                    tone: .warning,
                    heading: PurchaseReviewCopy.needsReviewHeading,
                    message: PurchaseReviewCopy.needsReviewMessage))
        #expect(entries[0].reading == reconciled)
        #expect(entries[1].reading == unreconciled)
    }

    @Test("a server-matched merchant remains a proposal in the review draft")
    func matchedMerchant() {
        let reading = reading(reconciled: true, matchedMerchantID: "merchant-1")

        let entry = ReviewEntry.batch(from: [
            row(id: "matched", outcome: .read(reading), byte: 1)
        ])[0]

        #expect(entry.draft.merchantResolution == .matched(id: "merchant-1"))
    }

    @Test("a reading without a matched merchant remains unresolved")
    func unresolvedMerchant() {
        let reading = reading(reconciled: true, matchedMerchantID: nil)

        let entry = ReviewEntry.batch(from: [
            row(id: "unresolved", outcome: .read(reading), byte: 1)
        ])[0]

        #expect(entry.draft.merchantResolution == .unresolved)
    }

    @Test("an unreadable receipt starts blank without inventing a reading or status")
    func unreadableDraft() {
        let entry = ReviewEntry.batch(from: [
            row(id: "unreadable", outcome: .unreadable(reason: "blank"), byte: 9)
        ])[0]

        #expect(entry.origin == .unreadable)
        #expect(entry.draft == ReceiptDraftPresentation().blankDraft(currency: nil))
        #expect(entry.reading == nil)
        #expect(entry.status == nil)
        #expect(entry.parts == [ReceiptPart(mediaType: .jpeg, data: Data([9]))])
    }

    @Test("review copy keeps the approved warning and unreadable wording")
    func copy() {
        #expect(PurchaseReviewCopy.needsReviewHeading == "Needs review")
        #expect(
            PurchaseReviewCopy.needsReviewMessage
                == "Some of what came back does not check out.")
        #expect(PurchaseReviewCopy.unreadableSubtitle == "Nothing could be read off this one.")
    }

    private func reading(
        reconciled: Bool,
        matchedMerchantID: String? = nil
    ) -> ReceiptDraftReading {
        ReceiptDraftReading(
            receiptUris: ["pops://purchases/receipt/test"],
            reconciled: reconciled,
            failures: reconciled ? [] : [.fake()],
            extracted: .fake(),
            capture: nil,
            matchedMerchantEntityID: matchedMerchantID)
    }

    private func row(
        id: String, outcome: PurchaseReadingRow.Outcome, byte: UInt8
    ) -> PurchaseReadingRow {
        PurchaseReadingRow(
            id: id,
            parts: [ReceiptPart(mediaType: .jpeg, data: Data([byte]))],
            outcome: outcome)
    }
}
