import Testing

@testable import DesignPlayground

/// Put back, the in-hand list, unpacking and split, exercised the way
/// ``InventoryActionTests`` exercises the verbs list: as pure logic, so a
/// wrong answer fails without a simulator.
@Suite("Inventory retrieval and unpacking logic")
internal struct InventoryRetrievalModelTests {
    @Test("put back returns an in-hand item to its previous placement")
    func putBackWithPreviousPlacement() {
        let retrieval = InventoryRetrievalItem(
            InventoryFoundationItem(
                id: "x", name: "X", typeName: "Thing",
                placement: .inHand(previous: "Documents drawer")))

        #expect(InventoryRetrieval.canPutBack(retrieval))
        let result = InventoryRetrieval.putBack(retrieval)
        #expect(result.placement == .direct(location: "Documents drawer"))
    }

    @Test("with no previous placement, put back is not offered and changes nothing")
    func putBackWithoutPreviousPlacement() {
        let retrieval = InventoryRetrievalItem(
            InventoryFoundationItem(
                id: "loose", name: "Loose", typeName: "Thing", placement: .inHand(previous: nil)))

        #expect(!InventoryRetrieval.canPutBack(retrieval))
        #expect(InventoryRetrieval.putBack(retrieval).placement == retrieval.item.placement)
    }

    @Test("a deleted previous placement cannot be put back to, even though one is recorded")
    func putBackWithDeletedPreviousPlacement() {
        let retrieval = InventoryRetrievalItem(
            InventoryFoundationItem(
                id: "trophy", name: "Trophy", typeName: nil,
                placement: .inHand(previous: "Old shelf")),
            previousStatus: .deleted)

        #expect(!InventoryRetrieval.canPutBack(retrieval))
    }

    @Test("picking up a placed item remembers where it was")
    func pickUpRemembersPreviousPlacement() {
        let item = InventoryFoundationItem(
            id: "y", name: "Y", typeName: "Thing", placement: .direct(location: "Garage"))

        let picked = InventoryRetrieval.pickUp(item)

        #expect(picked.placement == .inHand(previous: "Garage"))
    }

    @Test("picking up an item already in hand does not overwrite what it remembers")
    func pickUpIsIdempotent() {
        let item = InventoryFoundationItem(
            id: "z", name: "Z", typeName: "Thing", placement: .inHand(previous: "Garage"))

        #expect(InventoryRetrieval.pickUp(item).placement == item.placement)
    }

    @Test("a closed previous container still takes the item back")
    func putBackIgnoresClosedness() {
        let retrieval = InventoryRetrievalItem(
            InventoryFoundationItem(
                id: "album", name: "Album", typeName: nil, placement: .inHand(previous: "Linen 02"))
        )

        #expect(InventoryRetrieval.canPutBack(retrieval))
        #expect(retrieval.fromLine == "From Linen 02")
    }

    @Test("a deleted previous place says so instead of naming it")
    func deletedPreviousPlaceLine() {
        let retrieval = InventoryRetrievalItem(
            InventoryFoundationItem(
                id: "t", name: "T", typeName: nil, placement: .inHand(previous: "Old shelf")),
            previousStatus: .deleted)

        #expect(retrieval.fromLine == "Previous place deleted")
    }

    @Test("put back takes only rows with somewhere to go, and undo restores their positions")
    func putBackAllSkipsDeletedAndUndoRestoresOrder() {
        let items = [
            Self.inHand("a", from: "Hall"),
            Self.inHand("b", from: "Gone", status: .deleted),
            Self.inHand("c", from: "Study"),
            Self.inHand("d", from: "Garage"),
        ]
        var list = items

        let removal = InventoryInHand.putBack(["a", "b", "d"], from: &list)

        #expect(removal.entries.map(\.element.id) == ["a", "d"])
        #expect(list.map(\.id) == ["b", "c"])

        list.restore(removal)

        #expect(list == items)
    }

    @Test("put back of an id that is not in hand changes nothing")
    func putBackIgnoresUnknownIDs() {
        var list = [Self.inHand("a", from: "Hall")]

        let removal = InventoryInHand.putBack(["absent"], from: &list)

        #expect(removal.isEmpty)
        #expect(list.map(\.id) == ["a"])
    }

    @Test("Put all back is offered only once more than one thing is in hand")
    func putAllBackThreshold() {
        #expect(!InventoryInHand.offersPutAllBack([]))
        #expect(!InventoryInHand.offersPutAllBack([Self.inHand("a", from: "Hall")]))
        #expect(
            InventoryInHand.offersPutAllBack([
                Self.inHand("a", from: "Hall"), Self.inHand("b", from: "Study"),
            ]))
    }

    @Test("a container is just emptied only when everything it held has left")
    func justEmptied() {
        let contents = Self.contents(["1", "2"])

        #expect(!InventoryUnpacking.justEmptied(contents, removed: ["1"]))
        #expect(InventoryUnpacking.justEmptied(contents, removed: ["1", "2"]))
        #expect(
            !InventoryUnpacking.justEmptied(InventoryContainerContents(), removed: []),
            "a container that was always empty never asks")
    }

    @Test("closing never depends on whether the container is empty")
    func closeOutcomeIsIndependentOfContents() {
        let contents = Self.contents(["1", "2", "3"])

        #expect(
            InventoryUnpacking.closeOutcome(contents, removed: ["1"])
                == .closedPartial(remaining: 2))
        #expect(InventoryUnpacking.closeOutcome(contents, removed: ["1", "2", "3"]) == .empty)
    }

    private static func inHand(
        _ id: String, from previous: String,
        status: InventoryPreviousPlacementStatus = .current
    ) -> InventoryRetrievalItem {
        InventoryRetrievalItem(
            InventoryFoundationItem(
                id: id, name: id, typeName: nil, placement: .inHand(previous: previous)),
            previousStatus: status)
    }

    private static func contents(_ ids: [String]) -> InventoryContainerContents {
        InventoryContainerContents(
            entries: ids.map {
                InventoryContainedEntry(
                    item: InventoryFoundationItem(
                        id: $0, name: $0, typeName: nil, placement: .direct(location: "")),
                    added: "Today")
            })
    }
}
