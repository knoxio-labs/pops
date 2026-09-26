import CoreGraphics
import Testing

@testable import FeatureInventory

@Suite("Inventory label text")
internal struct InventoryLabelTextTests {
    @Test("lines retain top-to-bottom order and sort their text left to right")
    func ordersLinesAndWords() {
        let items = [
            item("bottom", x: 15, y: 80, width: 30, height: 12),
            item("top right", x: 80, y: 12, width: 35, height: 12),
            item("middle right", x: 90, y: 34, width: 40, height: 12),
            item("top left", x: 10, y: 10, width: 30, height: 20),
            item("middle left", x: 5, y: 30, width: 35, height: 20),
        ]

        #expect(
            InventoryLabelText.lines(from: items)
                == ["top left top right", "middle left middle right", "bottom"])
    }

    @Test("a line keeps the vertical span of its first item")
    func firstItemDefinesLineSpan() {
        let items = [
            item("first", x: 0, y: 10, width: 20, height: 10),
            item("second", x: 30, y: 12, width: 20, height: 16),
            item("third", x: 60, y: 19, width: 20, height: 6),
        ]

        #expect(InventoryLabelText.lines(from: items) == ["first second", "third"])
    }

    @Test("whitespace-only recognition is discarded")
    func filtersWhitespace() {
        let items = [
            item(" \n\t ", x: 0, y: 0, width: 20, height: 100),
            item(" \tSerial\n", x: 0, y: 20, width: 40, height: 10),
            item("123 \t", x: 50, y: 21, width: 20, height: 8),
            item("last", x: 0, y: 50, width: 20, height: 10),
        ]

        #expect(InventoryLabelText.lines(from: items) == ["Serial 123", "last"])
        #expect(InventoryLabelText.lines(from: Array(items.prefix(1))).isEmpty)
    }

    @Test("all four corners determine ordering and the vertical span", arguments: 0..<4)
    func allCornersDetermineBounds(rotation: Int) {
        let corners = [
            CGPoint(x: 20, y: 5), CGPoint(x: 30, y: 0),
            CGPoint(x: 35, y: 20), CGPoint(x: 0, y: 15),
        ]
        let skewed = InventoryRecognizedText(
            transcript: "first", topLeft: corners[rotation],
            topRight: corners[(rotation + 1) % 4], bottomRight: corners[(rotation + 2) % 4],
            bottomLeft: corners[(rotation + 3) % 4])

        #expect(
            InventoryLabelText.lines(from: [
                item("second", x: 10, y: 14, width: 10, height: 10), skewed,
            ]) == ["first second"])
    }

    @Test("empty recognition produces no lines")
    func emptyInput() {
        #expect(InventoryLabelText.lines(from: []).isEmpty)
    }

    private func item(
        _ transcript: String, x originX: CGFloat, y originY: CGFloat, width: CGFloat,
        height: CGFloat
    ) -> InventoryRecognizedText {
        InventoryRecognizedText(
            transcript: transcript,
            topLeft: CGPoint(x: originX, y: originY),
            topRight: CGPoint(x: originX + width, y: originY),
            bottomRight: CGPoint(x: originX + width, y: originY + height),
            bottomLeft: CGPoint(x: originX, y: originY + height))
    }
}
