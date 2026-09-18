import AppCore
import Foundation
import GRDB

/// How one `InventoryLocation` maps onto a row of either location layer.
internal enum LocationRow {
    static let columns = ["id", "revision", "seq", "name", "parent_id", "sort_order", "deleted_at"]

    static func values(of location: InventoryLocation) -> [(any DatabaseValueConvertible)?] {
        [
            location.id, location.revision, location.seq, location.name, location.parentId,
            location.sortOrder, location.deletedAt.map(storedDate),
        ]
    }

    static func decode(_ row: Row) throws -> InventoryLocation {
        InventoryLocation(
            id: try row.decode(forColumn: "id"), revision: try row.decode(forColumn: "revision"),
            seq: try row.decode(forColumn: "seq"), name: try row.decode(forColumn: "name"),
            parentId: try row.decode(forColumn: "parent_id"),
            sortOrder: try row.decode(forColumn: "sort_order"),
            deletedAt: try date(row, "deleted_at"))
    }
}

/// How one `InventoryEvent` maps onto a row of `event`. Events are immutable
/// on the server (D4), so a row is written once and never updated.
internal enum EventRow {
    static let columns = [
        "seq", "entity_kind", "entity_id", "kind", "fields", "before", "after", "reason",
        "actor_kind", "actor_id", "actor_label", "client_time", "server_time", "compensates_seq",
        "undoable",
    ]

    static func values(of event: InventoryEvent) throws -> [(any DatabaseValueConvertible)?] {
        let actor = actorColumns(event.actor)
        return [
            event.seq, event.entityKind.storageValue, event.entityId, event.kind.storageValue,
            try StoredJSON.encode(event.fields), try StoredFieldValue.encode(event.before),
            try StoredFieldValue.encode(event.after), event.reason?.storageValue, actor.kind,
            actor.id, actor.label, event.clientTime.map(storedDate), storedDate(event.serverTime),
            event.compensatesSeq, event.undoable,
        ]
    }

    static func decode(_ row: Row) throws -> InventoryEvent {
        let entityKind: String = try row.decode(forColumn: "entity_kind")
        guard let kind = InventoryEntityKind(storageValue: entityKind) else {
            throw InventoryReplicaError.corruptValue("entity kind \(entityKind)")
        }
        let reason: String? = try row.decode(forColumn: "reason")
        return InventoryEvent(
            seq: try row.decode(forColumn: "seq"), entityKind: kind,
            entityId: try row.decode(forColumn: "entity_id"),
            kind: InventoryEventKind(wire: try row.decode(forColumn: "kind")),
            fields: try StoredJSON.decode([String].self, from: try row.decode(forColumn: "fields")),
            before: try StoredFieldValue.decodeFields(try row.decode(forColumn: "before")),
            after: try StoredFieldValue.decodeFields(try row.decode(forColumn: "after")),
            reason: reason.map(InventoryDiscardReason.init(wire:)), actor: try actor(row),
            clientTime: try date(row, "client_time"),
            serverTime: try requiredDate(row, "server_time"),
            compensatesSeq: try row.decode(forColumn: "compensates_seq"),
            undoable: try row.decode(forColumn: "undoable"))
    }

    private struct ActorColumns {
        let kind: String
        var id: String?
        var label: String?
    }

    private static func actorColumns(_ actor: InventoryEventActor) -> ActorColumns {
        switch actor {
        case .device(let id, let label): ActorColumns(kind: "device", id: id, label: label)
        case .web: ActorColumns(kind: "web")
        case .service(let account): ActorColumns(kind: "service", id: account)
        case .migration: ActorColumns(kind: "migration")
        }
    }

    private static func actor(_ row: Row) throws -> InventoryEventActor {
        let kind: String = try row.decode(forColumn: "actor_kind")
        let id: String? = try row.decode(forColumn: "actor_id")
        let label: String? = try row.decode(forColumn: "actor_label")
        switch (kind, id, label) {
        case ("device", let id?, let label?): return .device(id: id, label: label)
        case ("web", _, _): return .web
        case ("service", let account?, _): return .service(account: account)
        case ("migration", _, _): return .migration
        default: throw InventoryReplicaError.corruptValue("actor \(kind)")
        }
    }
}
