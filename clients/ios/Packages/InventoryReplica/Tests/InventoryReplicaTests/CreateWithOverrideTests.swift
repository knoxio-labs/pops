import AppCore
import Foundation
import Testing

@testable import InventoryReplica

@Suite("Local reducer: a create carrying a computed-field override")
internal struct CreateWithOverrideTests {
    private static let newId = "30000000-0000-4000-8000-00000000000a"
    private static let fieldId = CommandVectorDecoding.computedFieldId
    private static let time = CommandVectorDecoding.clock

    private static func create(
        overrides: [InventoryProtocol2FieldValue]
    ) -> InventoryCommand {
        let catalogue = CommandVectorDecoding.computedCatalogue
        return .createProtocol2Item(
            InventoryNewProtocol2Item(
                id: newId, name: "Irregular lamp", catalogueRevision: catalogue.revision.revision,
                typeId: catalogue.types[0].id, overrides: overrides, placement: .hand))
    }

    @Test("the new item holds the override from its first revision")
    func createHoldsOverride() throws {
        let replica = try ComputedOverrideReducerTests.replica()

        _ = try replica.performLocally(
            Self.create(overrides: [.init(fieldId: Self.fieldId, values: [.boolean(true)])]),
            mutationId: "m1", clientTime: Self.time)

        let item = try #require(try replica.read(.item(id: Self.newId)))
        #expect(item.revision == 1)
        #expect(item.fieldValues.map(\.fieldId) == [Self.fieldId])
        #expect(item.fieldValues.map(\.source) == [.override])
        #expect(item.fieldValues.map(\.state) == [.value([.boolean(true)])])
    }

    @Test("an override the field forbids, or of the wrong kind, refuses the whole create")
    func forbiddenOverrideRefusesCreate() throws {
        for (allowOverride, value) in [
            (false, InventoryPrimitiveValue.boolean(true)), (true, .string("yes")),
        ] {
            let replica = try ComputedOverrideReducerTests.replica(allowOverride: allowOverride)

            let reason = ComputedOverrideReducerTests.rejection {
                _ = try replica.performLocally(
                    Self.create(overrides: [.init(fieldId: Self.fieldId, values: [value])]),
                    mutationId: "m1", clientTime: Self.time)
            }

            #expect(reason == .invalid)
            #expect(try replica.read(.item(id: Self.newId)) == nil)
        }
    }

    @Test("the override survives the log's stored form, and an older row decodes holding none")
    func storedFormRoundTrips() throws {
        let command = Self.create(overrides: [
            .init(fieldId: Self.fieldId, values: [.boolean(false)])
        ])
        let stored = StoredCommand(.command(command))
        let decoded = try StoredJSON.decode(StoredCommand.self, from: try StoredJSON.encode(stored))
        #expect(try decoded.logged() == .command(command))

        guard case .createProtocol2Item(let new) = command else {
            Issue.record("expected a protocol-2 create")
            return
        }
        let older = StoredCommand.createProtocol2Item(
            id: new.id, name: new.name, catalogueRevision: new.catalogueRevision,
            typeId: new.typeId, values: [], note: nil, externalIds: [], quantity: 1,
            placement: StoredPlacement(.hand), code: nil, overrides: nil)
        let olderJSON = try StoredJSON.encode(older)
        #expect(olderJSON.contains("overrides") == false)
        let olderDecoded = try StoredJSON.decode(StoredCommand.self, from: olderJSON)
        #expect(try olderDecoded.logged() == .command(Self.create(overrides: [])))
    }
}
