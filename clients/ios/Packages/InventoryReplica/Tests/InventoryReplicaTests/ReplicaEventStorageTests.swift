import AppCore
import Foundation
import InventoryReplica
import Testing

/// Events the transport decodes must come back out of the replica unchanged:
/// a move's placements and an actor kind this build has never heard of.
@Suite("Replica event storage")
internal struct ReplicaEventStorageTests {
    @Test("a move event's placement and previous placement survive the round trip")
    func movePlacementsRoundTrip() throws {
        let replica = try Fixture.downloaded(items: [Fixture.item("lamp")])
        let move = InventoryEvent(
            seq: 11, entityKind: .item, entityId: "lamp", kind: .moved,
            fields: ["placement", "previousPlacement"],
            before: ["placement": .placement(.location("hall"))],
            after: [
                "placement": .placement(.hand),
                "previousPlacement": .previousPlacement(.location("hall")),
            ],
            reason: nil, actor: .device(id: "device-1", label: "iPad"), clientTime: nil,
            serverTime: Fixture.created, compensatesSeq: nil, undoable: true)

        try replica.apply(Fixture.changes(events: [move]))

        #expect(try replica.read(.history(itemId: "lamp")) == [move])
    }

    @Test("a tombstoned and a container previous placement survive the round trip")
    func previousPlacementKinds() throws {
        let replica = try Fixture.downloaded(items: [Fixture.item("lamp")])
        let move = InventoryEvent(
            seq: 11, entityKind: .item, entityId: "lamp", kind: .moved, fields: ["placement"],
            before: ["previousPlacement": .previousPlacement(.tombstoned)],
            after: [
                "placement": .placement(.container("box")),
                "previousPlacement": .previousPlacement(.container("crate")),
            ],
            reason: nil, actor: .web, clientTime: nil, serverTime: Fixture.created,
            compensatesSeq: nil, undoable: false)

        try replica.apply(Fixture.changes(events: [move]))

        #expect(try replica.read(.history(itemId: "lamp")) == [move])
    }

    @Test("an actor kind this build does not know is kept verbatim, not refused")
    func unrecognisedActorIsKept() throws {
        let replica = try Fixture.downloaded(items: [Fixture.item("lamp")])
        let base = Fixture.event(seq: 11, itemId: "lamp")
        let event = InventoryEvent(
            seq: base.seq, entityKind: base.entityKind, entityId: base.entityId, kind: base.kind,
            fields: base.fields, before: base.before, after: base.after, reason: nil,
            actor: .unrecognised(kind: "robot", label: "Arm"), clientTime: nil,
            serverTime: base.serverTime, compensatesSeq: nil, undoable: true)

        try replica.apply(Fixture.changes(events: [event]))

        #expect(
            try replica.read(.history(itemId: "lamp")).first?.actor
                == .unrecognised(kind: "robot", label: "Arm"))
    }
}
