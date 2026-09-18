import Testing

@testable import DesignPlayground

/// The one action POPS-3980 asks the item detail page to make obvious:
/// Pick up, Put back, Move, or Restore. It is chosen by priority over
/// ``InventoryAction/available(for:style:)`` rather than re-derived, so this
/// suite is really asserting that priority, not the underlying rules
/// ``InventoryActionTests`` already covers.
@Suite("Item detail primary action")
internal struct InventoryItemDetailPrimaryActionTests {
    private typealias Fixtures = InventoryFoundationFixtures
    private let style = InventoryFoundationStyle()

    private func primary(_ item: InventoryFoundationItem) -> String? {
        InventoryItemDetailPrimaryAction.choose(for: item, style: style)?.id
    }

    @Test("a direct or contained item's primary action is picking it up")
    func directOrContainedPicksUp() {
        #expect(primary(Fixtures.television) == "pick-up")
        #expect(primary(Fixtures.cable) == "pick-up")
    }

    @Test("an in-hand item with somewhere to go back to is put back, not moved")
    func inHandPutsBack() {
        #expect(primary(Fixtures.passport) == "put-back")
    }

    @Test("an in-hand item with nowhere to go back to falls through to move")
    func inHandWithNoPreviousMoves() {
        let loose = InventoryFoundationItem(
            id: "loose", name: "Loose", typeName: "Thing", placement: .inHand(previous: nil))
        #expect(primary(loose) == "move")
    }

    @Test("an item that no longer counts is restored, ahead of anything else")
    func removedIsRestoredFirst() {
        #expect(primary(Fixtures.kettle) == "restore")
        #expect(primary(Fixtures.drill) == "restore")
    }

    @Test("a destroyed item has no primary action, because it has no actions at all")
    func destroyedHasNoPrimaryAction() {
        #expect(primary(Fixtures.lamp) == nil)
    }

    @Test("an open container not in hand is offered pick-up, same as any other item")
    func openContainerPicksUpToo() {
        #expect(primary(Fixtures.kitchenBox) == "pick-up")
    }
}
