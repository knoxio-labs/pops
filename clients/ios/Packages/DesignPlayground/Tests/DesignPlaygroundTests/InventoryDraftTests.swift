import Testing

@testable import DesignPlayground

/// What a draft will and will not let through.
///
/// POPS-3984's rule is that only a name is intrinsically required, which is a
/// claim with two halves: a draft without one cannot be created, and a draft
/// with nothing but one can. Both are asserted, because a validation that only
/// ever says no passes every test written from the first half alone.
@Suite("Inventory draft")
internal struct InventoryDraftTests {
    private func named(_ name: String) -> InventoryDraft {
        InventoryDraft(internalID: "itm-1", name: name, placement: .inHand)
    }

    @Test("a draft with no name cannot be created, and says which field")
    func nameIsRequired() {
        let draft = named("")

        #expect(draft.issues == [.nameMissing])
        #expect(!draft.canCreate)
    }

    @Test("a name alone is enough: no type, no code, no photo, no identifier")
    func nothingElseIsRequired() {
        let draft = named("Espresso grinder")

        #expect(draft.issues.isEmpty)
        #expect(draft.canCreate)
        #expect(draft.typeName == nil)
        #expect(draft.photos.isEmpty)
        #expect(!draft.code.isLabelled)
    }

    @Test("whitespace is not a name")
    func blankNameIsMissing() {
        #expect(named("   ").issues == [.nameMissing])
    }

    @Test("quantity defaults to one and is not a field there")
    func quantityDefaultsToOne() {
        let draft = named("Espresso grinder")

        #expect(draft.quantity == 1)
        #expect(!draft.isGrouped)
    }

    @Test("above one it becomes a field, and below one it is a complaint")
    func quantityBecomesAField() {
        var draft = named("Wood screws")
        draft.quantity = 48
        #expect(draft.isGrouped)
        #expect(draft.canCreate)

        draft.quantity = 0
        #expect(!draft.isGrouped)
        #expect(draft.issues.contains(.quantityBelowOne))
    }

    @Test("a code already worn by something else blocks the create")
    func collisionBlocks() {
        var draft = named("Espresso grinder")
        draft.code = InventoryCodeEntry(
            value: "BREW-0042", assist: .collision(existing: "Espresso machine"))

        #expect(!draft.canCreate)
        #expect(draft.issues.contains(.codeTaken("Espresso machine")))
    }

    @Test("every other suggestion state leaves the create alone")
    func otherAssistStatesDoNotBlock() {
        let states: [InventoryCodeAssist] = [
            .idle, .suggesting, .offered(alternatives: ["A1"]), .accepted, .rejected,
            .edited(suggested: "A1"), .offline, .unavailable(reason: "Off"),
        ]

        for state in states {
            var draft = named("Espresso grinder")
            draft.code = InventoryCodeEntry(value: "", assist: state)
            #expect(draft.canCreate, "\(state) should not stop a create")
        }
    }

    @Test("an identifier row with no value is a complaint about that row")
    func incompleteIdentifier() {
        var draft = named("Laptop")
        draft.identifiers = [InventoryExternalIdentifier(id: "i1", label: "Serial", value: "")]
        #expect(draft.issues == [.identifierIncomplete(label: "Serial")])

        draft.identifiers = [InventoryExternalIdentifier(id: "i1", label: "Serial", value: "C02X")]
        #expect(draft.canCreate)
    }

    @Test("a placement segment chosen and not answered is a complaint")
    func unansweredPlacement() {
        var draft = named("Laptop")
        draft.placement = .anotherContainer(container: nil, location: nil)

        #expect(draft.issues == [.placementUnanswered])
    }

    @Test("a photo alone is staged work worth asking about before discarding")
    func photosCountAsStagedWork() {
        var draft = InventoryDraft(internalID: "itm-1", placement: .inHand)
        #expect(!draft.hasStagedWork)

        draft.photos = [InventoryDraftPhoto(id: "ph-1")]
        #expect(draft.hasStagedWork)
    }
}

/// Copying an item, which has to carry what describes the thing and drop what
/// identifies this one.
@Suite("Inventory draft copies")
internal struct InventoryDraftCopyTests {
    private let source = InventoryFoundationFixtures.kitchenBox

    @Test("a copy gets its own internal id and remembers where it came from")
    func copyHasItsOwnIdentity() {
        let copy = InventoryDraft.duplicating(source, internalID: "itm-new")

        #expect(copy.internalID == "itm-new")
        #expect(copy.internalID != source.id)
        #expect(copy.copiedFrom == source.id)
    }

    @Test("a copy carries no inventory code, because a label is on one object")
    func copyClearsTheCode() {
        let copy = InventoryDraft.duplicating(source, internalID: "itm-new")

        #expect(source.code != nil, "the fixture has to carry a code or this proves nothing")
        #expect(copy.code.value.isEmpty)
        #expect(!copy.code.isLabelled)
        #expect(copy.code.assist == .idle)
    }

    @Test("a copy carries the name, the type, the quantity and the placement")
    func copyCarriesTheDescription() {
        let copy = InventoryDraft.duplicating(source, internalID: "itm-new")

        #expect(copy.name == source.name)
        #expect(copy.typeName == source.typeName)
        #expect(copy.quantity == source.quantity.count)
        #expect(copy.placement == InventoryPlacementChoice(source.placement))
    }

    @Test("editing keeps the record's own id and the code it already wears")
    func editingKeepsIdentity() {
        let draft = InventoryDraft.editing(source)

        #expect(draft.internalID == source.id)
        #expect(draft.copiedFrom == nil)
        #expect(draft.code.value == source.code)
    }
}
