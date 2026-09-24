import AppCore
import Testing

@testable import FeatureInventory

/// ``InventoryCatalogueRepairReading``: each repair state the approved
/// design stages, read from the structured reason and the current fields.
@Suite("Inventory catalogue repair reading")
internal struct InventoryCatalogueRepairReadingTests {
    private typealias Fixture = CatalogueRepairFixture

    private static func detail(
        _ repair: InventoryRepair,
        catalogue: InventoryCatalogueSnapshot = Fixture.catalogue()
    ) throws -> InventoryCatalogueRepairDetail {
        try #require(Fixture.reading(catalogue).detail(repair))
    }

    @Test("an archived field: struck, named, and Edit item leads with no Retry")
    func fieldArchived() throws {
        let detail = try Self.detail(Fixture.shieldingArchived)

        #expect(detail.title == "Queued edit")
        #expect(detail.problem == "Shielding was archived")
        #expect(
            detail.values == [
                InventoryQueuedValue(
                    id: Fixture.shielding.id, field: "Shielding", value: "Braided", fit: .archived),
                InventoryQueuedValue(
                    id: Fixture.length.id, field: "Length", value: "2 m", fit: .fits),
            ])
        #expect(detail.leadingAction == .editItem)
        #expect(!detail.offersRetry)
        #expect(detail.refusal == "Shielding is still archived, so nothing was sent.")
    }

    @Test("a replaced field says what replaced it")
    func fieldReplaced() throws {
        let repair = Fixture.repair(
            queued: Fixture.edit([(Fixture.screen, .string("55 in"))]),
            changes: [
                Fixture.change(
                    .field, Fixture.screen.id, .replaced, fieldId: Fixture.screen.id,
                    replacementId: Fixture.diagonal.id)
            ])

        let detail = try Self.detail(repair)

        #expect(detail.problem == "Screen size was replaced by Diagonal")
        #expect(detail.values.first?.fit == .replaced(by: "Diagonal"))
        #expect(detail.values.first?.fit.caption == "Now Diagonal")
    }

    @Test("a retired option names the option and the field it left")
    func optionRetired() throws {
        let repair = Fixture.repair(
            queued: Fixture.edit([(Fixture.colour, .enumeration(optionId: Fixture.sage.id))]),
            changes: [
                Fixture.change(.option, Fixture.sage.id, .retired, fieldId: Fixture.colour.id)
            ])

        let detail = try Self.detail(repair)

        #expect(detail.problem == "Sage was retired from Colour")
        #expect(detail.values.map(\.fit) == [.optionRetired])
        #expect(detail.refusal == "Sage is still retired, so nothing was sent.")
    }

    @Test("a new item missing a field that became required lists it as not set")
    func nowRequired() throws {
        let create = InventoryCommand.createProtocol2Item(
            InventoryNewProtocol2Item(
                id: "espresso", name: "Espresso", catalogueRevision: 1, typeId: Fixture.typeId,
                values: [.init(fieldId: Fixture.length.id, values: [.string("30 cm")])],
                placement: .hand))
        let repair = Fixture.repair(
            queued: create,
            changes: [
                Fixture.change(
                    .field, Fixture.capacity.id, .nowRequired, fieldId: Fixture.capacity.id)
            ])

        let detail = try Self.detail(repair)

        #expect(detail.title == "Queued new item")
        #expect(detail.problem == "Capacity is now required")
        #expect(
            detail.values.last
                == InventoryQueuedValue(
                    id: Fixture.capacity.id, field: "Capacity", value: "Not set", fit: .nowRequired)
        )
    }

    @Test("fields not on this phone wait for Sync, then Retry leads once they arrive")
    func fieldsNotHereThenArrived() throws {
        let head = Fixture.field("f-head", "Head")
        let repair = Fixture.repair(
            queued: Fixture.edit([(head, .string("Countersunk"))]),
            changes: [
                InventoryCatalogueChange(
                    definition: .revision, id: "3", change: .notInRevision, revision: 3)
            ])
        let arrived = Fixture.repair(
            queued: Fixture.edit([(head, .string("Countersunk"))]),
            changes: repair.catalogue?.changes ?? [], current: 3)

        let waiting = try Self.detail(repair)
        let ready = try Self.detail(
            arrived, catalogue: Fixture.catalogue(revision: 3, extra: [head]))

        #expect(waiting.problem == "This edit needs newer fields")
        #expect(waiting.values.map(\.fit) == [.notOnPhone])
        #expect(waiting.refusal == "The new fields have not arrived yet. Try again after Sync.")
        #expect(waiting.leadingAction == .editItem)
        #expect(!waiting.offersRetry)
        #expect(ready.values.map(\.fit) == [.fits])
        #expect(ready.leadingAction == .retry)
        #expect(ready.offersRetry)
    }

    @Test("still blocked after the fields changed: Edit item leads, Retry sits beside it")
    func blockedAfterChange() throws {
        let repair = Fixture.repair(
            queued: Fixture.shieldingArchived.catalogue?.queued,
            changes: Fixture.shieldingArchived.catalogue?.changes ?? [], current: 3)

        let detail = try Self.detail(repair, catalogue: Fixture.catalogue(revision: 3))

        #expect(detail.leadingAction == .editItem)
        #expect(detail.offersRetry)
    }

    @Test("a field back in use fits again whatever the server named")
    func unarchivedFieldFits() throws {
        let revived = Fixture.field("f-shielding", "Shielding")
        let catalogue = InventoryCatalogueSnapshot(
            revision: InventoryCatalogueRevision(revision: 3, minimumProtocol: 2),
            types: [
                InventoryCatalogueType(
                    id: Fixture.typeId, key: "cable", label: "Cable", sortOrder: 0,
                    fields: [revived, Fixture.length])
            ])

        let detail = try Self.detail(Fixture.shieldingArchived, catalogue: catalogue)

        #expect(!detail.isBlocked)
        #expect(detail.problem == "Shielding was archived")
    }

    @Test("every other repair kind has no catalogue reading")
    func otherKindsHaveNone() {
        let conflict = InventoryFixture.repair("m1", on: "lamp", kind: .conflict)

        #expect(Fixture.reading().detail(conflict) == nil)
    }
}
