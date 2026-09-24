import AppCore
import Foundation
import Testing

@testable import FeatureInventory

/// A cable whose `Powers` field takes only lamps, the records it can name,
/// and the repairs a stale reference opens on it.
internal enum StaleReferenceFixture {
    private typealias Base = CatalogueRepairFixture

    static let lampType = "type-lamp"
    static let deskLamp = "desk-lamp"
    static let oldLamp = "old-lamp"
    static let router = "router"

    static let powers = InventoryCatalogueField(
        id: "f-powers", typeId: Base.typeId, key: "powers", label: "Powers", sortOrder: 6,
        kind: .reference, cardinality: .one, required: false, storage: .stored,
        references: InventoryReferenceConstraint(targetKinds: [.item], targetTypeIds: [lampType]))

    static let catalogue = Base.catalogue(extra: [powers])

    static let items = [
        Base.cable,
        record(deskLamp, "Desk lamp", typeId: lampType),
        record(oldLamp, "Old lamp", typeId: lampType, deleted: true),
        record(router, "Router", typeId: "type-router"),
    ]

    static func record(_ id: String, _ name: String, typeId: String, deleted: Bool = false)
        -> InventoryItem
    {
        InventoryItem(
            id: id, revision: 1, seq: 1, name: name, typeId: typeId, typeKey: nil,
            placement: .hand,
            createdAt: InventoryFixture.epoch, updatedAt: InventoryFixture.epoch,
            deletedAt: deleted ? InventoryFixture.epoch : nil)
    }

    static func reference(_ id: String) -> InventoryPrimitiveValue {
        .reference(InventoryReferenceValue(targetKind: .item, targetId: id))
    }

    /// The queued edit: Powers pointed at `target`, Length set to 2 m.
    static func edit(pointingAt target: String) -> InventoryCommand {
        Base.edit([(powers, reference(target)), (Base.length, .string("2 m"))])
    }

    static func repair(
        pointingAt target: String, stale: InventoryStaleReference? = .targetMissing
    ) -> InventoryRepair {
        InventoryRepair(
            id: "m1", entityKind: .item, entityId: Base.cableId, kind: .catalogueChanged,
            catalogue: InventoryCatalogueRepair(
                queued: edit(pointingAt: target), changes: [], openedAtRevision: Base.revision,
                currentRevision: Base.revision, staleReference: stale),
            openedAt: InventoryFixture.epoch)
    }

    static func source(_ repairs: [InventoryRepair]) -> FormFixtureSource {
        FormFixtureSource(
            items: items, protocol2Catalogue: catalogue,
            ledger: InventoryReplicaSyncLedger(repairs: repairs))
    }

    static func store(_ repair: InventoryRepair) -> RecordingFormStore {
        RecordingFormStore(source([repair]))
    }

    static func detail(_ repair: InventoryRepair) throws -> InventoryCatalogueRepairDetail {
        try #require(
            InventorySyncPage.catalogueReading(source([repair]), for: [repair]).detail(repair))
    }
}

/// A queued item change whose reference value the server refused
/// (`target_missing`, `reference_type_mismatch`) opens the catalogue repair:
/// Edit item leads, its picker offers only records the field allows, and Let
/// go stays (POPS-4494's approved rule for anything still in the way).
@MainActor
@Suite("Inventory catalogue repair: stale reference")
internal struct InventoryStaleReferenceRepairTests {
    private typealias Fixture = StaleReferenceFixture

    @Test("a deleted record is struck through by name, and Edit item leads with no Retry")
    func deletedRecord() throws {
        let detail = try Fixture.detail(Fixture.repair(pointingAt: Fixture.oldLamp))

        #expect(detail.problem == "Powers links to a record no longer in Inventory")
        #expect(
            detail.values == [
                InventoryQueuedValue(
                    id: Fixture.powers.id, field: "Powers", value: "Old lamp", fit: .recordGone),
                InventoryQueuedValue(
                    id: CatalogueRepairFixture.length.id, field: "Length", value: "2 m",
                    fit: .fits),
            ])
        #expect(detail.leadingAction == .editItem)
        #expect(!detail.offersRetry)
        #expect(
            detail.refusal
                == "Powers still links to a record no longer in Inventory, so nothing was sent.")
    }

    @Test("a record of a type the field does not take says it is not allowed")
    func recordNotAllowed() throws {
        let detail = try Fixture.detail(
            Fixture.repair(pointingAt: Fixture.router, stale: .typeNotAllowed))

        #expect(detail.problem == "Powers no longer allows Router")
        #expect(detail.refusal == "Powers still does not allow Router, so nothing was sent.")
        #expect(detail.values.first?.fit == .recordNotAllowed)
        #expect(detail.values.first?.fit.caption == "Not allowed")
        #expect(detail.leadingAction == .editItem)
    }

    @Test("a record this phone never held reads as missing, not by its id")
    func neverHeldRecord() throws {
        let detail = try Fixture.detail(Fixture.repair(pointingAt: "ghost"))

        #expect(detail.values.first?.fit == .recordGone)
        #expect(detail.values.first?.value == "Missing item")
    }

    @Test(
        "a record still offered here takes the server's reason: the phone has not heard yet",
        arguments: [
            (InventoryStaleReference.targetMissing, InventoryFieldFit.recordGone),
            (.typeNotAllowed, .recordNotAllowed),
        ])
    func serverReasonWhenThePhoneDisagrees(
        stale: InventoryStaleReference, fit: InventoryFieldFit
    ) throws {
        let detail = try Fixture.detail(Fixture.repair(pointingAt: Fixture.deskLamp, stale: stale))

        #expect(detail.values.map(\.fit) == [fit, .fits])
        #expect(detail.leadingAction == .editItem)
    }

    @Test("a repair about a definition leaves its reference values alone")
    func definitionRepairIgnoresReferences() throws {
        let detail = try Fixture.detail(Fixture.repair(pointingAt: Fixture.oldLamp, stale: nil))

        #expect(detail.values.allSatisfy { $0.fit == .fits })
    }

    @Test("Edit item leaves the stale record out and offers only records the field takes")
    func editItemPicksAnAllowedRecord() async throws {
        let store = Fixture.store(Fixture.repair(pointingAt: Fixture.oldLamp))
        let form = InventoryItemFormModel(request: .repair("m1"), store: store, suggester: .unbound)
        let loading = await form.startAndAwaitReady()
        defer { loading.cancel() }

        #expect(form.phase == .ready)
        #expect(form.notCarried.map(\.field) == ["Powers"])
        #expect(form.notCarried.first?.fit == .recordGone)
        #expect(form.protocol2Draft?.values(for: Fixture.powers).isEmpty == true)
        #expect(
            form.protocol2Draft?.values(for: CatalogueRepairFixture.length) == [.string("2 m")])
        let offered = form.referenceTargets(for: Fixture.powers)
        #expect(offered.map(\.id) == [Fixture.deskLamp])

        let entry = try #require(form.protocol2Draft?.draftEntries(for: Fixture.powers).first)
        let deskLamp = try #require(offered.first)
        form.protocol2Draft?.setValue(
            .reference(deskLamp.value), entryId: entry.id, for: Fixture.powers)
        #expect(await form.submit())

        guard case .replaceMine(.editProtocol2Item(_, _, let patches))? = store.resolutions.last
        else {
            Issue.record("expected the edited change, got \(store.resolutions)")
            return
        }
        let sent = patches.first { $0.fieldId == Fixture.powers.id }?.values
        #expect(sent == [.reference(deskLamp.value)])
        #expect(store.performed.isEmpty)
    }

    @Test("the repair screen leads with Edit item, and Let go still settles it")
    func repairScreen() async throws {
        let store = Fixture.store(Fixture.repair(pointingAt: Fixture.oldLamp))
        let model = InventoryRepairViewModel(repairId: "m1", store: store)
        let task = await model.startAndAwaitFirstAnswer()
        defer { task.cancel() }

        #expect(model.row?.problem == "Powers links to a record no longer in Inventory")
        #expect(model.row?.catalogue?.leadingAction == .editItem)
        #expect(model.row?.catalogue?.offersRetry == false)
        #expect(model.row?.repair.kind.opensRepair == true)

        await model.commit(keepingMine: false, code: nil)

        #expect(store.resolutions == [.discardMine])
        #expect(model.outcome == "Let go")
    }
}
