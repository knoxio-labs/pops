import AppCore
import Foundation

/// What a row shows for the entity it is about: a name to read, a glyph or
/// photo to draw, resolved once per page read rather than by every row.
internal struct InventorySyncEntityDisplay: Equatable, Sendable {
    internal let name: String
    internal let symbol: InventorySymbol
    internal let photo: String?

    /// A record that has since been removed from the replica, or never
    /// existed there (a location, which carries no photo).
    internal static let unknown = InventorySyncEntityDisplay(
        name: "Deleted record", symbol: .item, photo: nil)
}

/// One change waiting to sync, resolved for its row.
internal struct InventorySyncWaitingRow: Identifiable, Equatable, Sendable {
    internal let id: String
    internal let display: InventorySyncEntityDisplay
    internal let detail: String
    internal let progress: Double?
}

/// One repair, resolved for its row.
internal struct InventorySyncRepairRow: Identifiable, Equatable, Sendable {
    internal let repair: InventoryRepair
    internal let display: InventorySyncEntityDisplay
    internal let problem: String

    internal var id: String { repair.id }
}

/// One settled repair, resolved for its row.
internal struct InventorySyncResolvedRow: Identifiable, Equatable, Sendable {
    internal let entry: InventoryResolvedEntry
    internal let display: InventorySyncEntityDisplay

    internal var id: String { entry.id }
}

extension InventorySyncPage {
    /// Every waiting change, in the drain's replay order, resolved for
    /// display.
    internal static func buildWaitingRows(
        _ ledger: InventoryReplicaSyncLedger, reading source: any InventoryQuerySource
    ) -> [InventorySyncWaitingRow] {
        ledger.waiting.map { mutation in
            InventorySyncWaitingRow(
                id: mutation.receipt.mutationId,
                display: display(
                    for: mutation.receipt.entityKind, id: mutation.receipt.entityId, source: source),
                detail: title(for: mutation.command),
                progress: mutation.progress)
        }
    }

    internal static func buildRepairRows(
        _ ledger: InventoryReplicaSyncLedger, reading source: any InventoryQuerySource
    ) -> [InventorySyncRepairRow] {
        ledger.repairs.map { repair in
            InventorySyncRepairRow(
                repair: repair,
                display: display(for: repair.entityKind, id: repair.entityId, source: source),
                problem: problem(for: repair))
        }
    }

    internal static func buildResolvedRows(
        _ ledger: InventoryReplicaSyncLedger, reading source: any InventoryQuerySource
    ) -> [InventorySyncResolvedRow] {
        ledger.resolved.map { entry in
            InventorySyncResolvedRow(
                entry: entry,
                // The resolved entry does not carry which table it was: an
                // item id and a location id are both UUIDs, so a location is
                // tried first and an item second. Wrong only when a
                // collision minted the same id in both tables, which the
                // server's migration preflight aborts on (ADR-002).
                display: source.inventoryLocation(id: entry.entityId).map {
                    InventorySyncEntityDisplay(name: $0.name, symbol: .item, photo: nil)
                } ?? display(for: .item, id: entry.entityId, source: source))
        }
    }

    private static func display(
        for kind: InventoryEntityKind, id: String, source: any InventoryQuerySource
    ) -> InventorySyncEntityDisplay {
        switch kind {
        case .item:
            guard let item = source.inventoryItem(id: id) else { return .unknown }
            return InventorySyncEntityDisplay(
                name: item.name, symbol: .record(access: item.containment?.access),
                photo: item.photos.first?.sha256)
        case .location:
            guard let location = source.inventoryLocation(id: id) else { return .unknown }
            return InventorySyncEntityDisplay(name: location.name, symbol: .item, photo: nil)
        }
    }

    /// A short verb for what a queued command will do, for the waiting row's
    /// caption. Deliberately coarse: the record row beside it already names
    /// the thing, so this only needs to say what is about to happen to it.
    private static func title(for command: InventoryCommand) -> String {
        switch command {
        case .createItem, .createLocation: "Create"
        case .renameLocation: "Rename"
        case .moveLocation: "Move"
        case .deleteLocation: "Delete"
        case .revertEvent: "Undo"
        default: itemCommandTitle(for: command)
        }
    }

    /// Every op that changes an item's own fields, its type, its code or its
    /// place, split from `title(for:)` so neither function's branching
    /// climbs past the shared complexity budget on its own.
    private static func itemCommandTitle(for command: InventoryCommand) -> String {
        switch command {
        case .editItem: "Edit"
        case .changeItemType: "Change type"
        case .setItemCode: "Set code"
        case .moveItem(_, _, let verb): title(for: verb)
        case .setItemAccess(_, let access): access == .open ? "Open" : "Close"
        case .setItemFull(_, let isFull): isFull ? "Mark full" : "Mark not full"
        default: itemLifecycleCommandTitle(for: command)
        }
    }

    /// Every op about an item's lifecycle, quantity or photos.
    private static func itemLifecycleCommandTitle(for command: InventoryCommand) -> String {
        switch command {
        case .setItemLifecycle: "Change status"
        case .setItemQuantity: "Change quantity"
        case .splitItem: "Split"
        case .attachPhoto: "Add photo"
        case .removePhoto: "Remove photo"
        case .reorderPhotos: "Reorder photos"
        case .restoreDeletedItem: "Restore"
        case .createItem, .editItem, .changeItemType, .setItemCode, .moveItem, .setItemAccess,
            .setItemFull, .createLocation, .renameLocation, .moveLocation, .deleteLocation,
            .revertEvent:
            // Unreachable: `title(for:)` and `itemCommandTitle(for:)` handle
            // every one of these before falling through to this function.
            ""
        }
    }

    private static func title(for verb: InventoryMoveVerb) -> String {
        switch verb {
        case .move: "Move"
        case .pickUp: "Pick up"
        case .putBack: "Put back"
        case .store: "Store"
        }
    }

    /// The one line a repair states before its two commits, per the approved
    /// Repair screen.
    private static func problem(for repair: InventoryRepair) -> String {
        switch repair.kind {
        case .conflict:
            return "\(repair.field?.capitalized ?? "This") changed here and elsewhere."
        case .codeCollision:
            let code = repair.options.first?.value ?? repair.suggestedCode ?? "This code"
            guard let heldByName = repair.heldByName else { return "\(code) is already in use." }
            return "\(code) is already on \(heldByName)."
        case .deletedElsewhere:
            return "This was deleted on another device."
        case .photoFailed:
            return "This photo could not be uploaded."
        case .unrecognised:
            return "This change needs a person to look at it."
        }
    }
}
