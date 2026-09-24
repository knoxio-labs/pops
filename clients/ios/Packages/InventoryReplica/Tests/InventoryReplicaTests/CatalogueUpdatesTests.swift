import AppCore
import Foundation
import GRDB
import Testing

@testable import InventoryReplica

/// ``CatalogueUpdates``: a change the server wants authored against newer
/// fields is held, with why, until this phone has them, then moved onto
/// them or sent to repair with what is in the way.
@Suite("Catalogue updates: hold and move")
internal struct CatalogueUpdatesTests {
    private typealias Setup = LocalComputedFixture

    private static let widthArchived = InventoryCatalogueChange(
        definition: .field, id: Setup.width, typeId: Setup.typeId, fieldId: Setup.width,
        change: .archived, revision: Setup.revision + 1)

    /// A replica with the box's width edited, logged as `m1`.
    private static func edited() throws -> InventoryReplica {
        let replica = try LocalComputedValueTests.replica()
        try LocalComputedValueTests.edit(
            replica, Setup.box, Setup.width, [try Setup.decimal("4.0")], mutationId: "m1")
        return replica
    }

    private static func answer(
        _ replica: InventoryReplica, _ reason: InventoryRejectedReason,
        _ changes: [InventoryCatalogueChange] = [], mint: String = "m2"
    ) throws {
        try replica.recordOutcomes(
            InventoryMutationBatchResult(
                outcomes: [
                    "m1": .rejected(reason: reason, message: "x", catalogueChanges: changes)
                ],
                highWaterSeq: 12),
            mintMutationId: { mint })
    }

    /// Revision `Setup.revision + 1`: the same box, with `fields` changed.
    private static func publish(
        _ replica: InventoryReplica,
        _ change: (InventoryCatalogueField) -> InventoryCatalogueField = { $0 }
    ) throws {
        let types = Setup.catalogue.types.map { type in
            InventoryCatalogueType(
                id: type.id, key: type.key, label: type.label, sortOrder: type.sortOrder,
                fields: type.fields.map(change))
        }
        try replica.store(
            InventoryCatalogueSnapshot(
                revision: InventoryCatalogueRevision(
                    revision: Setup.revision + 1, minimumProtocol: 2),
                types: types))
    }

    private static func archiving(_ fieldId: String) -> (InventoryCatalogueField)
        -> InventoryCatalogueField
    {
        { field in
            guard field.id == fieldId else { return field }
            return InventoryCatalogueField(
                id: field.id, typeId: field.typeId, key: field.key, label: field.label,
                sortOrder: field.sortOrder, kind: field.kind, cardinality: field.cardinality,
                required: field.required, storage: field.storage,
                archivedAt: "2026-09-24T00:00:00.000Z")
        }
    }

    @Test("an update-required change is held for new fields, and the ledger says so")
    func heldForNewFields() throws {
        let replica = try Self.edited()

        try Self.answer(replica, .catalogueUpdateRequired)

        let waiting = try replica.ledger.waiting
        #expect(waiting.map(\.id) == ["m2"])
        #expect(waiting.first?.hold == .waitingForFields)
        #expect(try replica.outboundMutations().isEmpty)
        #expect(try replica.ledger.repairs.isEmpty)
    }

    @Test("a revision that needs a newer app holds the change for an app update")
    func heldForAppUpdate() throws {
        let replica = try Self.edited()
        let gated = InventoryCatalogueChange(
            definition: .revision, id: "4", change: .needsNewerApp, revision: 4)

        try Self.answer(replica, .catalogueUpdateRequired, [gated])

        #expect(try replica.ledger.waiting.first?.hold == .needsAppUpdate)
    }

    @Test("a refresh too old for the catalogue marks what is held as needing an app update")
    func markedWhenTheAppIsTooOld() throws {
        let replica = try Self.edited()
        try Self.answer(replica, .catalogueUpdateRequired)

        try replica.markChangesAwaitingCatalogueNeedAppUpdate()

        #expect(try replica.ledger.waiting.first?.hold == .needsAppUpdate)
        let stored = try replica.database.read { db in
            try String.fetchOne(
                db, sql: "SELECT catalogue_hold FROM mutation_log WHERE mutation_id = 'm2'")
        }
        #expect(stored == "app_update")
    }

    @Test("newer fields that still fit move the change onto them and release it")
    func compatibleMoveReleases() throws {
        let replica = try Self.edited()
        try Self.answer(replica, .catalogueUpdateRequired)
        try Self.publish(replica)

        try replica.moveChangesAwaitingCatalogue()

        let sent = try replica.outboundMutations()
        #expect(sent.map(\.mutationId) == ["m2"])
        #expect(sent.first?.catalogueRevision == Setup.revision + 1)
        #expect(try replica.ledger.waiting.first?.hold == nil)
        let entry = try replica.database.read {
            try MutationLogRows.entry(mutationId: "m2", in: $0)
        }
        #expect(entry?.catalogueHold == nil)
        #expect(entry?.catalogueChanges.isEmpty == true)
    }

    @Test("newer fields that archived what the change used open its repair, naming the field")
    func incompatibleMoveOpensRepair() throws {
        let replica = try Self.edited()
        try Self.answer(replica, .catalogueUpdateRequired)
        try Self.publish(replica, Self.archiving(Setup.width))

        try replica.moveChangesAwaitingCatalogue()

        let repair = try #require(try replica.ledger.repairs.first)
        #expect(repair.id == "m2")
        #expect(repair.kind == .catalogueChanged)
        #expect(repair.catalogue?.changes == [Self.widthArchived])
        #expect(repair.catalogue?.openedAtRevision == Setup.revision + 1)
        #expect(repair.catalogue?.definitionsChanged == false)
        guard case .editProtocol2Item(let id, _, _)? = repair.catalogue?.queued else {
            Issue.record("expected the queued edit on the repair")
            return
        }
        #expect(id == Setup.box)
        #expect(try replica.ledger.waiting.isEmpty)
    }

    @Test("no newer revision after a refresh opens the repair with what the server named")
    func noNewerRevisionOpensRepair() throws {
        let replica = try Self.edited()
        let named = InventoryCatalogueChange(
            definition: .field, id: Setup.depth, typeId: Setup.typeId, fieldId: Setup.depth,
            change: .nowRequired, revision: Setup.revision + 1)
        try Self.answer(replica, .catalogueUpdateRequired, [named])

        try replica.moveChangesAwaitingCatalogue()

        #expect(try replica.ledger.repairs.first?.catalogue?.changes == [named])
    }

    @Test("a repair-required change opens its repair at once, carrying the server's reasons")
    func repairRequiredOpensDirectly() throws {
        let replica = try Self.edited()

        try Self.answer(replica, .catalogueRepairRequired, [Self.widthArchived])

        let repair = try #require(try replica.ledger.repairs.first)
        #expect(repair.id == "m1")
        #expect(repair.catalogue?.changes == [Self.widthArchived])
        #expect(try replica.ledger.waiting.isEmpty)
    }

    @Test("a repair-required change with a named replacement is held to try the replacement")
    func namedReplacementIsHeld() throws {
        let replica = try Self.edited()
        let replaced = InventoryCatalogueChange(
            definition: .field, id: Setup.width, typeId: Setup.typeId, fieldId: Setup.width,
            change: .replaced, replacementId: Setup.depth, revision: Setup.revision + 1)

        try Self.answer(replica, .catalogueRepairRequired, [replaced])
        try Self.publish(replica, Self.archiving(Setup.width))
        try replica.moveChangesAwaitingCatalogue()

        #expect(try replica.ledger.repairs.isEmpty)
        let sent = try #require(try replica.outboundMutations().first)
        guard case .editProtocol2Item(_, let revision, let patches) = sent.command else {
            Issue.record("expected the edit, moved")
            return
        }
        #expect(revision == Setup.revision + 1)
        #expect(patches.map(\.fieldId) == [Setup.depth])
    }

    @Test("a repair opened under one catalogue offers Retry once a newer one arrives")
    func definitionsChangedAfterOpening() throws {
        let replica = try Self.edited()
        try Self.answer(replica, .catalogueRepairRequired, [Self.widthArchived])
        #expect(try replica.ledger.repairs.first?.catalogue?.definitionsChanged == false)

        try Self.publish(replica)

        #expect(try replica.ledger.repairs.first?.catalogue?.definitionsChanged == true)
    }
}
