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
            title: "\(name) \(verb(for: event, current: item))",
            place: item.flatMap { places.immediate($0.placement) },
            at: event.serverTime,
            symbol: symbol(for: event.kind),
            isUndoable: event.undoable)
    }

    /// The past-tense verb. Access, fullness and lifecycle read the value the event
    /// recorded, falling back to the item's current one; a kind this build
    /// has never heard of shows its own wire word rather than a guess.
    internal static func verb(for event: InventoryEvent, current: InventoryItem?) -> String {
        switch event.kind {
        case .accessChanged:
            let access =
                recorded(event, "access").map(InventoryAccess.init(wire:))
                ?? current?.containment?.access
            return access == .closed ? "closed" : "opened"
        case .fullnessChanged:
            let recordedFull: InventoryFieldValue? = event.after["isFull"]
            if case .flag(let isFull) = recordedFull {
                return isFull ? "marked full" : "no longer full"
            }
            return current?.containment?.isFull == false ? "no longer full" : "marked full"
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
        .moved: "moved",
        .quantityChanged: "recounted",
        .split: "split",
        .codeChanged: "labelled",
        .photoAttached: "photographed",
        .photoRemoved: "photo removed",
        .photosReordered: "photos reordered",
        .deleted: "deleted",
        .restored: "restored",
        .locationCreated: "added",
        .locationRenamed: "renamed",
        .locationMoved: "moved",
        .locationDeleted: "deleted",
        .reverted: "undone",
        .migrated: "imported",
    ]

    private static let symbols: [InventoryEventKind: String] = [
        .created: "plus",
        .locationCreated: "plus",
        .moved: "arrow.right",
        .locationMoved: "arrow.right",
        .accessChanged: "shippingbox.fill",
        .lifecycleChanged: "archivebox",
        .deleted: "trash",
        .locationDeleted: "trash",
        .reverted: "arrow.uturn.backward",
    ]
}
