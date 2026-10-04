import AppCore
import Foundation

/// How an event reads as one line of Recent work: the thing's name, what
/// happened to it, and a glyph for the kind of change.
internal enum InventoryActivityLine {
    internal static func activity(
        for event: InventoryEvent, source: any InventoryQuerySource, places: InventoryPlaceNames
    ) -> InventoryDashboard.Activity {
        let item = event.entityKind == .item ? source.inventoryItem(id: event.entityId) : nil
        let location =
            event.entityKind == .location ? source.inventoryLocation(id: event.entityId) : nil
        let name = item?.name ?? location?.name ?? "Something"
        return InventoryDashboard.Activity(
            id: event.seq,
            entityKind: event.entityKind,
            entityId: event.entityId,
            title: "\(name) \(verb(for: event, current: item))",
            place: item.flatMap { places.immediate($0.placement) },
            at: event.serverTime,
            symbol: symbol(for: event.kind),
            isUndoable: event.undoable,
            route: route(item: item, location: location))
    }

    private static func route(item: InventoryItem?, location: InventoryLocation?)
        -> InventoryRoute?
    {
        if let item, !item.isDeleted {
            return .record(id: item.id, isContainer: item.isContainer)
        }
        if let location, !location.isDeleted { return .place(location.id) }
        return nil
    }

    /// The past-tense verb. Edited location fields and fullness use the values
    /// recorded on the event; unknown kinds show their wire word.
    internal static func verb(for event: InventoryEvent, current: InventoryItem?) -> String {
        switch event.kind {
        case .edited:
            return editedVerb(for: event)
        case .lifecycleChanged:
            let lifecycle =
                recorded(event, "lifecycle").map(InventoryLifecycle.init(wire:))
                ?? current?.lifecycle
            return lifecycle.map(lifecycleVerb) ?? "changed"
        case .unrecognised(let wire):
            return wire.replacingOccurrences(of: "_", with: " ")
        default:
            return verbs[event.kind] ?? "changed"
        }
    }

    private static func editedVerb(for event: InventoryEvent) -> String {
        if event.entityKind == .location {
            if event.fields.contains("parentId") { return "moved" }
            if event.fields.contains("name") { return "renamed" }
        }
        if case .flag(let isFull)? = event.after["isFull"] {
            return isFull ? "marked full" : "no longer full"
        }
        return "edited"
    }

    internal static func symbol(for kind: InventoryEventKind) -> String {
        symbols[kind] ?? "clock.arrow.circlepath"
    }

    private static func recorded(_ event: InventoryEvent, _ field: String) -> String? {
        switch event.after[field] {
        case .choice(let value), .text(let value): value
        default: nil
        }
    }

    private static func lifecycleVerb(_ lifecycle: InventoryLifecycle) -> String {
        switch lifecycle {
        case .active: "restored"
        case .retired: "retired"
        case .discarded: "discarded"
        case .lost: "marked lost"
        case .destroyed: "destroyed"
        case .unrecognised: "changed"
        }
    }

    /// A table rather than a `switch`, for the reason `InventoryEventKind`'s
    /// own wire table gives: independent one-line mappings with nothing
    /// shared between them.
    private static let verbs: [InventoryEventKind: String] = [
        .created: "added",
        .edited: "edited",
        .typeChanged: "given a type",
        .fieldValuesChanged: "edited",
        .overrideSet: "set an override",
        .overrideCleared: "cleared an override",
        .codeSet: "labelled",
        .moved: "moved",
        .pickedUp: "picked up",
        .putBack: "put back",
        .stored: "stored",
        .opened: "opened",
        .closed: "closed",
        .sealed: "sealed",
        .unpacked: "unpacked",
        .quantityChanged: "recounted",
        .splitFrom: "split",
        .splitInto: "split",
        .photoAdded: "photographed",
        .photoRemoved: "photo removed",
        .deleted: "deleted",
        .restored: "restored",
        .reverted: "undone",
        .migrated: "imported",
    ]

    private static let symbols: [InventoryEventKind: String] = [
        .created: "plus",
        .moved: "arrow.right",
        .pickedUp: "arrow.right",
        .putBack: "arrow.right",
        .stored: "arrow.right",
        .opened: "shippingbox.fill",
        .closed: "shippingbox.fill",
        .sealed: "shippingbox.fill",
        .unpacked: "shippingbox.fill",
        .lifecycleChanged: "archivebox",
        .deleted: "trash",
        .reverted: "arrow.uturn.backward",
    ]
}
