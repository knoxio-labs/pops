import Testing

@testable import DesignPlayground

/// Which verbs an item offers, and how reversible each one looks. The red
/// rule, destructive styling only for what cannot be undone, is the one most
/// likely to be "fixed" by someone who sees Discard in plain text.
@Suite("Inventory actions")
internal struct InventoryActionTests {
    private typealias Fixtures = InventoryFoundationFixtures
    private let defaults = InventoryFoundationStyle()

    private func ids(_ item: InventoryFoundationItem, style: InventoryFoundationStyle? = nil)
        -> [String]
    {
        InventoryAction.available(for: item, style: style ?? defaults).map(\.id)
    }

    @Test("a destroyed item offers nothing, because there is no way back to offer")
    func destroyedOffersNothing() {
        #expect(ids(Fixtures.lamp).isEmpty)
    }

    @Test("an item that no longer counts is offered only the way back")
    func removedOffersRestoreOnly() {
        #expect(ids(Fixtures.kettle) == ["restore"])
        #expect(ids(Fixtures.drill) == ["restore"])
    }

    @Test("an item in hand is put back, not picked up")
    func inHandActions() {
        let actions = ids(Fixtures.passport)

        #expect(actions.contains("put-back"))
        #expect(!actions.contains("pick-up"))
        #expect(actions.contains("move"))
    }

    @Test("with nowhere to go back to, put back is not offered")
    func noPreviousNoPutBack() {
        let loose = InventoryFoundationItem(
            id: "loose", name: "Loose", typeName: "Thing", placement: .inHand(previous: nil))

        #expect(!ids(loose).contains("put-back"))
    }

    @Test("an open container can be closed; sealing appears only when the style offers it")
    func sealIsOptIn() {
        #expect(ids(Fixtures.kitchenBox).contains("close"))
        #expect(!ids(Fixtures.kitchenBox).contains("seal"))
        #expect(
            ids(Fixtures.kitchenBox, style: .init(closeActions: .closeAndSeal)).contains("seal"))
    }

    @Test("a closed container is reopened, not closed again")
    func closedContainerReopens() {
        let actions = ids(Fixtures.linenBox)

        #expect(actions.contains("reopen"))
        #expect(!actions.contains("close"))
        #expect(!actions.contains("put-in"))
    }

    @Test("an item that is not a container has no container actions")
    func itemsHaveNoContainerActions() {
        let actions = ids(Fixtures.television)

        #expect(!actions.contains("close"))
        #expect(!actions.contains("reopen"))
        #expect(!actions.contains("put-in"))
    }

    @Test("split needs more than one, and label needs no code yet")
    func recordActions() {
        #expect(ids(Fixtures.screws).contains("split"))
        #expect(!ids(Fixtures.cable).contains("split"))
        #expect(ids(Fixtures.cable).contains("label"))
        #expect(!ids(Fixtures.television).contains("label"))
    }

    @Test("discarding is reversible and is not drawn as destructive")
    func discardIsNotRed() {
        let discard = InventoryAction.available(for: Fixtures.cable, style: defaults).first {
            $0.id == "discard"
        }

        #expect(discard?.weight == .reversibleRemoval)
    }

    @Test("exactly one action on an active item is irreversible, and it is marking it destroyed")
    func oneIrreversibleAction() {
        let irreversible = InventoryAction.available(for: Fixtures.cable, style: defaults)
            .filter { $0.weight == .irreversible }

        #expect(irreversible.map(\.id) == ["destroy"])
        #expect(irreversible.first?.note != nil)
    }
}
