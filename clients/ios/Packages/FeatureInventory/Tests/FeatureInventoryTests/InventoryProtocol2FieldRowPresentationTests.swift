import Testing

@testable import FeatureInventory

@Suite("Protocol-2 entry reordering")
internal struct InventoryProtocol2EntryReorderingTests {
    private static let entries = ["one", "two", "three"].map {
        InventoryProtocol2DraftEntry(id: $0)
    }

    @Test("dragging onto a later entry moves the source one step later")
    func laterTargetMovesForward() {
        let decision = InventoryProtocol2EntryReordering.move(
            draggedID: "one", targetID: "two", entries: Self.entries)

        #expect(decision?.id == "one")
        #expect(decision?.offset == 1)
    }

    @Test("dragging onto an earlier entry moves the source one step earlier")
    func earlierTargetMovesBackward() {
        let decision = InventoryProtocol2EntryReordering.move(
            draggedID: "three", targetID: "two", entries: Self.entries)

        #expect(decision?.id == "three")
        #expect(decision?.offset == -1)
    }

    @Test("missing, equal, and non-dragged entries do not request a move")
    func invalidDragDoesNothing() {
        #expect(
            InventoryProtocol2EntryReordering.move(
                draggedID: nil, targetID: "two", entries: Self.entries) == nil)
        #expect(
            InventoryProtocol2EntryReordering.move(
                draggedID: "two", targetID: "two", entries: Self.entries) == nil)
        #expect(
            InventoryProtocol2EntryReordering.move(
                draggedID: "missing", targetID: "two", entries: Self.entries) == nil)
    }
}
