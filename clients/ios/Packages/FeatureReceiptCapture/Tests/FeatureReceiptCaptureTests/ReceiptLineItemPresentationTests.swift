import AppCore
import Testing

@testable import FeatureReceiptCapture

/// The line items of a reading the gate refused, as values.
///
/// Its own suite rather than a section of ``ReceiptResultPresentationTests``:
/// the rest of that file is about which fields survive and in what order,
/// and these are about a group that is no longer a field at all — the items
/// were one newline-joined blob under an "Items" label until the design pass
/// made them rows.
@Suite("Receipt reading — line items")
internal struct ReceiptLineItemPresentationTests {
    private static let presentation = ReceiptResultPresentation()

    /// The line items are rows of their own rather than one newline-joined
    /// blob under an "Items" label, which is what they were. A reviewer runs
    /// down a column of amounts; they cannot run down a paragraph.
    @Test("the line items are separate rows, each with its own amount")
    func needsReviewDrawsLineItemsAsRows() {
        let extracted = ExtractedReceipt.fake(
            lines: [
                .fake(description: "Milk", amount: "4.50"),
                .fake(description: "Bread", amount: "3.20"),
            ])
        let result = Self.presentation.content(
            .needsReview(receiptCount: 1, failures: [.fake()], extracted: extracted))

        guard case .needsReview(let content) = result else {
            Issue.record("expected needsReview")
            return
        }
        #expect(content.lines.map(\.description) == ["Milk", "Bread"])
        #expect(content.lines.map(\.amount) == ["4.50", "3.20"])
        #expect(content.lines.allSatisfy { $0.note == nil })
    }

    /// A quantity and a unit note are one aside beside the amount, so the
    /// description column stays a column. Neither is invented: a `×1` on a
    /// weighed line makes it look counted.
    @Test("a line's quantity and unit note fold into one note, and only when stated")
    func lineNotesAreOnlyWhatWasPrinted() {
        let extracted = ExtractedReceipt.fake(
            lines: [
                .fake(description: "Milk", amount: "9.00", quantity: 2, unitNote: nil),
                .fake(description: "Apples", amount: "7.84", quantity: nil, unitNote: "$4.90/kg"),
                .fake(description: "Bread", amount: "6.00", quantity: 3, unitNote: "$2.00 each"),
                .fake(description: "Bag", amount: "0.15", quantity: nil, unitNote: nil),
            ])
        let result = Self.presentation.content(
            .needsReview(receiptCount: 1, failures: [.fake()], extracted: extracted))

        guard case .needsReview(let content) = result else {
            Issue.record("expected needsReview")
            return
        }
        #expect(content.lines.map(\.note) == ["×2", "$4.90/kg", "×3 $2.00 each", nil])
    }

    /// A receipt can print the same item twice, and two rows sharing an
    /// identity is a row that disappears under `ForEach`.
    @Test("two identical lines are two rows")
    func repeatedLinesAreDistinctlyIdentified() {
        let extracted = ExtractedReceipt.fake(
            lines: [
                .fake(description: "Milk", amount: "4.50"),
                .fake(description: "Milk", amount: "4.50"),
            ])
        let result = Self.presentation.content(
            .needsReview(receiptCount: 1, failures: [.fake()], extracted: extracted))

        guard case .needsReview(let content) = result else {
            Issue.record("expected needsReview")
            return
        }
        #expect(content.lines.count == 2)
        #expect(Set(content.lines.map(\.id)).count == 2)
    }
}
