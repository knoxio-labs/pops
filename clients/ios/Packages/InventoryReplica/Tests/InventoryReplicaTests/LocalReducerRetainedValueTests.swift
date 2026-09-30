import AppCore
import Testing

@testable import InventoryReplica

/// An item still holding a value for a field archived in a newer revision
/// keeps it when an edit moves it onto that revision, as the server's
/// retention rule allows: only new values for an archived field are refused.
@Suite("Local reducer: values an item keeps across a rebased edit")
internal struct LocalReducerRetainedValueTests {
    private typealias Setup = LocalComputedFixture
    private typealias Rebased = LocalReducerRebasedEditTests

    private static func editDepth(_ replica: InventoryReplica, at revision: Int) throws {
        _ = try replica.perform(
            .editProtocol2Item(
                id: Setup.box, catalogueRevision: revision,
                values: [
                    InventoryProtocol2FieldPatch(
                        fieldId: Setup.depth, values: [try Setup.decimal("5")])
                ]),
            mutationId: "m1", clientTime: Setup.time)
    }

    @Test("an item keeps a value for a field archived since, and takes an edit to another field")
    func archivedFieldValueIsRetainedAcrossTheRebase() throws {
        let replica = try LocalComputedValueTests.replica()
        try Rebased.publish(replica, revision: Setup.revision + 1, Rebased.archiving(Setup.width))

        try Self.editDepth(replica, at: Setup.revision + 1)

        #expect(try replica.outboundMutations().map(\.mutationId) == ["m1"])
        let item = try #require(try replica.read(.item(id: Setup.box)))
        #expect(item.catalogueRevision == Setup.revision + 1)
        #expect(try Rebased.width(of: replica) == (try Setup.decimal("2.0")))
        let depth = item.fieldValues.first { $0.fieldId == Setup.depth }?.state
        #expect(depth == .value([try Setup.decimal("5")]))
    }

    @Test("a field gone from the newer revision still refuses the edit")
    func removedFieldStillRefusesTheRebase() throws {
        let replica = try LocalComputedValueTests.replica()
        let types = Setup.catalogue.types.map { type in
            InventoryCatalogueType(
                id: type.id, key: type.key, label: type.label, sortOrder: type.sortOrder,
                fields: type.fields.filter { $0.id != Setup.width })
        }
        try replica.store(
            InventoryCatalogueSnapshot(
                revision: InventoryCatalogueRevision(
                    revision: Setup.revision + 1, minimumProtocol: 2),
                types: types))

        #expect(throws: InventoryCommandError.self) {
            try Self.editDepth(replica, at: Setup.revision + 1)
        }
        #expect(try replica.outboundMutations().isEmpty)
        #expect(try replica.read(.item(id: Setup.box))?.catalogueRevision == Setup.revision)
    }
}
