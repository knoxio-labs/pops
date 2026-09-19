import AppCore
import Foundation
import Testing

@testable import InventoryReplica

@Suite("Mutation log: external ids")
internal struct MutationLogExternalIdsTests {
    static let crateId = "20000000-0000-4000-8000-0000000000c2"
    static let time = Fixture.created.addingTimeInterval(60)
    static let serial = InventoryExternalIdentifier(kind: "serial", value: "SN-1")
    static let model = InventoryExternalIdentifier(kind: "model", value: "M-9")

    static func replica() throws -> InventoryReplica {
        try Fixture.downloaded(
            items: [Fixture.item("lamp", name: "Lamp", revision: 4)],
            locations: [Fixture.location("hall", revision: 3)])
    }

    @Test("a create keeps its external ids on the row and in the logged command")
    func createKeepsExternalIds() throws {
        let replica = try Self.replica()
        let new = InventoryNewItem(
            id: Self.crateId, name: "Crate", typeKey: nil, externalIds: [Self.serial],
            placement: .hand)

        _ = try replica.perform(.createItem(new), mutationId: "create", clientTime: Self.time)

        #expect(try replica.read(.item(id: Self.crateId))?.externalIds == [Self.serial])
        #expect(try replica.outboundMutations().first?.command == .createItem(new))
    }

    @Test("an edit carrying external ids replaces the list; one without them leaves it")
    func editReplacesOrLeaves() throws {
        let replica = try Self.replica()
        let replace = InventoryCommand.editItem(
            id: "lamp", name: nil, note: .unchanged, fields: [:],
            externalIds: [Self.model, Self.serial])
        _ = try replica.perform(replace, mutationId: "ids", clientTime: Self.time)
        _ = try replica.perform(
            .editItem(id: "lamp", name: "Desk lamp", note: .unchanged, fields: [:]),
            mutationId: "rename", clientTime: Self.time)

        let lamp = try #require(try replica.read(.item(id: "lamp")))
        #expect(lamp.externalIds == [Self.model, Self.serial])
        #expect(lamp.name == "Desk lamp")
        let sent = Dictionary(
            uniqueKeysWithValues: try replica.outboundMutations().map { ($0.mutationId, $0) })
        #expect(sent["ids"]?.command == replace)
    }

    @Test("an edit to an empty list clears every external id")
    func editClears() throws {
        let replica = try Self.replica()
        _ = try replica.perform(
            .editItem(
                id: "lamp", name: nil, note: .unchanged, fields: [:], externalIds: [Self.serial]),
            mutationId: "set", clientTime: Self.time)

        _ = try replica.perform(
            .editItem(id: "lamp", name: nil, note: .unchanged, fields: [:], externalIds: []),
            mutationId: "clear", clientTime: Self.time)

        #expect(try replica.read(.item(id: "lamp"))?.externalIds == [])
    }

    @Test("an external id without a kind or a value is refused and logs nothing")
    func blankRefused() throws {
        let replica = try Self.replica()

        for blank in [
            InventoryExternalIdentifier(kind: "", value: "SN-1"),
            InventoryExternalIdentifier(kind: "serial", value: ""),
        ] {
            #expect(
                throws: InventoryCommandError.rejected(
                    reason: .invalid, message: "an external id has a kind and a value")
            ) {
                try replica.perform(
                    .editItem(
                        id: "lamp", name: nil, note: .unchanged, fields: [:], externalIds: [blank]),
                    mutationId: "blank-\(blank.kind)", clientTime: Self.time)
            }
        }
        #expect(try replica.outboundMutations().isEmpty)
        #expect(try replica.read(.item(id: "lamp"))?.externalIds == [])
    }
}
