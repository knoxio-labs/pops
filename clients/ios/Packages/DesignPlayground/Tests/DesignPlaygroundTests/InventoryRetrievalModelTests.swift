import Testing

@testable import DesignPlayground

/// Put back, unpacking progress and split, exercised the way
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

    @Test("only a quantity of one can move as a retrieval action")
    func canMoveWholeOnlyForSingles() {
        let single = InventoryFoundationItem(
            id: "a", name: "A", typeName: "Thing", quantity: 1,
            placement: .direct(location: "Garage"))
        let group = InventoryFoundationItem(
            id: "b", name: "B", typeName: "Thing", quantity: 12,
            placement: .direct(location: "Garage"))

        #expect(InventoryRetrieval.canMoveWhole(single))
        #expect(!InventoryRetrieval.canMoveWhole(group))
    }

    @Test("unpacking progress reports how much is left, and completes at zero")
    func unpackingProgress() {
        var state = InventoryUnpackingState(
            containerName: "Crate 3",
            remaining: [
                InventoryFoundationItem(
                    id: "1", name: "One", typeName: "Thing", placement: .direct(location: "")),
                InventoryFoundationItem(
                    id: "2", name: "Two", typeName: "Thing", placement: .direct(location: "")),
            ])

        #expect(state.progress.remainingItems == 2)
        #expect(!state.progress.isComplete)

        state.place(["1"], at: "Kitchen")

        #expect(state.progress.remainingItems == 1)
        #expect(state.progress.placedItems == 1)
        #expect(state.createdDestinations == ["Kitchen"])

        state.place(["2"], at: "Kitchen")

        #expect(state.progress.isComplete)
        #expect(
            state.createdDestinations == ["Kitchen"], "the same destination is not listed twice")
    }

    @Test("keeping something in hand is not a placement and not a new destination")
    func keepInHandIsNotAPlacement() {
        var state = InventoryUnpackingState(
            containerName: "Crate 3",
            remaining: [
                InventoryFoundationItem(
                    id: "1", name: "One", typeName: "Thing", placement: .direct(location: "")),
                InventoryFoundationItem(
                    id: "2", name: "Two", typeName: "Thing", placement: .direct(location: "")),
            ])

        state.keepInHand(["1"])

        #expect(state.inHandCount == 1)
        #expect(state.progress.placedItems == 0)
        #expect(state.createdDestinations.isEmpty, "the hand is not somewhere an item was put")
        #expect(state.progress.remainingItems == 1, "it is out of the box")
        #expect(!state.progress.isComplete)
    }

    @Test("a box emptied entirely into the hand is not finished unpacking")
    func everythingInHandIsNotComplete() {
        var state = InventoryUnpackingState(
            containerName: "Crate 3",
            remaining: [
                InventoryFoundationItem(
                    id: "1", name: "One", typeName: "Thing", placement: .direct(location: ""))
            ])

        state.keepInHand(["1"])

        #expect(state.closeOutcome == .empty, "nothing is inside it any more")
        #expect(!state.progress.isComplete, "but nothing has a new home either")
        #expect(state.progress.summary.contains("in hand"))
    }

    @Test("keeping an id that is not inside the container changes nothing")
    func keepInHandIgnoresUnknownIDs() {
        var state = InventoryUnpackingState(
            containerName: "Crate 3",
            remaining: [
                InventoryFoundationItem(
                    id: "1", name: "One", typeName: "Thing", placement: .direct(location: ""))
            ])

        state.keepInHand(["absent"])

        #expect(state.inHandCount == 0)
        #expect(state.remaining.count == 1)
    }

    @Test("closing never depends on whether the container is empty")
    func closeOutcomeIsIndependentOfContents() {
        let partial = InventoryUnpackingState(
            containerName: "Crate",
            remaining: [
                InventoryFoundationItem(
                    id: "1", name: "One", typeName: "Thing", placement: .direct(location: ""))
            ])
        let empty = InventoryUnpackingState(containerName: "Crate", remaining: [])

        #expect(partial.closeOutcome == .closedPartial(remaining: 1))
        #expect(empty.closeOutcome == .empty)
    }

    @Test("splitting takes part of a quantity into a new, independent record")
    func splitArithmetic() throws {
        let quantity = InventoryQuantity(count: 12)

        let (remaining, split) = try InventoryQuantitySplit.split(quantity, taking: 5)

        #expect(remaining.count == 7)
        #expect(split.count == 5)
        #expect(remaining.count + split.count == quantity.count)
    }

    @Test("splitting all or none of a quantity is rejected")
    func splitRejectsOutOfRangeAmounts() {
        let quantity = InventoryQuantity(count: 4)

        #expect(throws: InventoryQuantitySplitError.amountOutOfRange) {
            try InventoryQuantitySplit.split(quantity, taking: 0)
        }
        #expect(throws: InventoryQuantitySplitError.amountOutOfRange) {
            try InventoryQuantitySplit.split(quantity, taking: 4)
        }
        #expect(throws: InventoryQuantitySplitError.amountOutOfRange) {
            try InventoryQuantitySplit.split(quantity, taking: 9)
        }
    }
}
