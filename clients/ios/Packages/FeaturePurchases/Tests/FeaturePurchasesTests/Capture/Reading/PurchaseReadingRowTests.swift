import AppCore
import Testing

@testable import FeaturePurchases

@Suite("Purchase reading row")
internal struct PurchaseReadingRowTests {
    private static let read = PurchaseReadingRow.Outcome.read(
        ReceiptDraftReading(
            receiptUris: [],
            reconciled: true,
            failures: [],
            extracted: .fake(),
            capture: nil))
    private static let unreadable = PurchaseReadingRow.Outcome.unreadable(reason: "blank")

    @Test("every row outcome is distinct")
    func distinctOutcomes() {
        #expect(PurchaseReadingRow.Outcome.queued != .reading)
        #expect(PurchaseReadingRow.Outcome.queued != Self.read)
        #expect(PurchaseReadingRow.Outcome.queued != Self.unreadable)
        #expect(PurchaseReadingRow.Outcome.reading != Self.read)
        #expect(PurchaseReadingRow.Outcome.reading != Self.unreadable)
        #expect(Self.read != Self.unreadable)
    }

    @Test("only completed and unreadable outcomes are settled")
    func settledOutcomes() {
        #expect(!PurchaseReadingRow.Outcome.queued.isSettled)
        #expect(!PurchaseReadingRow.Outcome.reading.isSettled)
        #expect(Self.read.isSettled)
        #expect(Self.unreadable.isSettled)
    }
}
