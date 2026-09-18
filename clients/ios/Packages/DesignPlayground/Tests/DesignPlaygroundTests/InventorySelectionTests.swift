import Testing

@testable import DesignPlayground

@Suite("Inventory selection")
internal struct InventorySelectionTests {
    private static let all = ["a", "b", "c"]

    @Test("nothing is selected, so the list is not selecting")
    func startsIdle() {
        let selection = InventorySelection()

        #expect(!selection.isSelecting)
        #expect(selection.ids.isEmpty)
        #expect(!selection.isAllSelected(Self.all))
    }

    @Test("the first mark tapped enters selection mode and the last one cleared leaves it")
    func toggleEntersAndLeaves() {
        var selection = InventorySelection()

        selection.toggle("a")
        #expect(selection.isSelecting)
        #expect(selection.contains("a"))

        selection.toggle("b")
        selection.toggle("a")
        #expect(selection.isSelecting)
        #expect(selection.ids == ["b"])

        selection.toggle("b")
        #expect(!selection.isSelecting)
        #expect(selection.ids.isEmpty)
    }

    @Test("Select all selects every row, and again clears and leaves selection mode")
    func selectAllThenDeselect() {
        var selection = InventorySelection(["b"])

        selection.toggleAll(Self.all)
        #expect(selection.ids == Set(Self.all))
        #expect(selection.isAllSelected(Self.all))

        selection.toggleAll(Self.all)
        #expect(!selection.isSelecting)
    }

    @Test("an empty list is never all selected, and Select all on it selects nothing")
    func emptyListIsNeverAllSelected() {
        var selection = InventorySelection()

        #expect(!selection.isAllSelected([]))
        selection.toggleAll([])
        #expect(!selection.isSelecting)
    }

    @Test("a selection that includes rows beyond the list still reads as all selected")
    func supersetCountsAsAll() {
        let selection = InventorySelection(["a", "b", "c", "gone"])

        #expect(selection.isAllSelected(Self.all))
        #expect(!selection.isAllSelected(Self.all + ["d"]))
    }

    @Test("rows that left the list stop counting, and the last to leave ends selection mode")
    func keepOnlyPrunes() {
        var selection = InventorySelection(["a", "b"])

        selection.keepOnly(["b", "c"])
        #expect(selection.ids == ["b"])

        selection.keepOnly(["c"])
        #expect(!selection.isSelecting)
    }

    @Test("Cancel clears everything")
    func clear() {
        var selection = InventorySelection(Set(Self.all))

        selection.deselectAll()

        #expect(!selection.isSelecting)
    }
}
