import AppCore
import Foundation
import InventoryReplica
import Synchronization

internal enum Fixture {
    static let epoch = "epoch-1"
    static let created = Date(timeIntervalSinceReferenceDate: 800_000_000.125)

    static func item(
        _ id: String, name: String? = nil, revision: Int = 1, placement: InventoryPlacement = .hand,
        containment: InventoryContainment? = nil, code: String? = nil, deletedAt: Date? = nil
    ) -> InventoryItem {
        InventoryItem(
            id: id, revision: revision, seq: revision, name: name ?? id, typeKey: nil,
            code: code, placement: placement, containment: containment, createdAt: created,
            updatedAt: created.addingTimeInterval(Double(revision)), deletedAt: deletedAt)
    }

    static func box(
        _ id: String, revision: Int = 1, placement: InventoryPlacement,
        access: InventoryAccess = .open
    ) -> InventoryItem {
        item(
            id, revision: revision, placement: placement,
            containment: InventoryContainment(access: access, isFull: false))
    }

    static func location(
        _ id: String, revision: Int = 1, parentId: String? = nil, sortOrder: Int = 0,
        deletedAt: Date? = nil
    ) -> InventoryLocation {
        InventoryLocation(
            id: id, revision: revision, seq: revision, name: id, parentId: parentId,
            sortOrder: sortOrder, deletedAt: deletedAt)
    }

    static func snapshot(
        items: [InventoryItem] = [], locations: [InventoryLocation] = [], epoch: String = epoch,
        total: Int? = nil, nextCursor: String? = nil
    ) -> InventorySnapshotPage {
        InventorySnapshotPage(
            epoch: epoch, highWaterSeq: 10, catalogueVersion: "cat-1",
            total: total ?? items.count + locations.count, items: items, locations: locations,
            nextCursor: nextCursor)
    }

    static func changes(
        items: [InventoryItem] = [], locations: [InventoryLocation] = [],
        events: [InventoryEvent] = [], epoch: String = epoch, nextSince: Int = 20
    ) -> InventoryChangesPage {
        InventoryChangesPage(
            epoch: epoch, items: items, locations: locations, events: events,
            nextSince: nextSince, hasMore: false, catalogueVersion: "cat-1")
    }

    static func event(seq: Int, itemId: String, kind: InventoryEventKind = .edited)
        -> InventoryEvent
    {
        InventoryEvent(
            seq: seq, entityKind: .item, entityId: itemId, kind: kind, fields: ["name"],
            before: ["name": .text("Old")], after: ["name": .text("New")], reason: nil,
            actor: .device(id: "device-1", label: "iPad"), clientTime: nil,
            serverTime: created.addingTimeInterval(Double(seq)), compensatesSeq: nil, undoable: true
        )
    }

    /// A replica that has completed a one-page snapshot of `items` and
    /// `locations`, so a change-feed page can apply on top of it.
    static func downloaded(
        items: [InventoryItem] = [], locations: [InventoryLocation] = [],
        now: @escaping @Sendable () -> Date = { created }
    ) throws -> InventoryReplica {
        let replica = try InventoryReplica(now: now)
        try replica.apply(snapshot(items: items, locations: locations))
        return replica
    }
}

extension InventoryReplica {
    func ids(_ query: InventoryQuery<[InventoryItem]>) throws -> [String] {
        try read(query).map(\.id)
    }
}

/// A clock a test moves by hand.
internal final class TestClock: Sendable {
    private let current: Mutex<Date>

    init(_ start: Date) { current = Mutex(start) }

    var now: Date {
        get { current.withLock { $0 } }
        set { current.withLock { $0 = newValue } }
    }
}
