import AppCore

/// One item as Item detail's header, action row and menu need it: what a
/// person reads, with every reference already resolved to a name.
internal struct InventoryDetailRecord: Identifiable, Equatable {
    internal let id: InventoryItem.ID
    internal let name: String
    /// Nil for an item filed before its type exists.
    internal let typeName: String?
    internal let code: String?
    internal let quantity: InventoryQuantity
    internal let trail: InventoryDetailTrail
    /// Present only on containers.
    internal let access: InventoryAccess?
    internal let lifecycle: InventoryLifecycle
    internal let sync: InventorySync
    /// Where Put back would return an in-hand item.
    internal let previous: InventoryPreviousPlace

    internal var symbol: InventorySymbol { .record(access: access) }
}

/// Where an item is, as names from the room inward, and the screen a tap on
/// it opens: the location or container holding it directly.
internal struct InventoryDetailTrail: Equatable {
    internal let crumbs: [String]
    internal let isInHand: Bool
    internal let holder: InventoryRoute?

    internal static let inHand = InventoryDetailTrail(crumbs: [], isInHand: true, holder: nil)

    /// The crumbs to draw when there is not room for all of them: the room,
    /// then the container the item is actually in, with the elision marked.
    internal var collapsedCrumbs: [String] {
        guard crumbs.count > 2, let first = crumbs.first, let last = crumbs.last else {
            return crumbs
        }
        return [first, "\u{2026}", last]
    }
}

/// A field the item's type declares, or one the item holds that its type no
/// longer does, and what this item recorded for it.
internal struct InventoryDetailField: Identifiable, Equatable {
    internal let key: String
    internal let label: String
    internal let value: String
    internal var source: InventoryDetailFieldSource = .recorded

    internal var id: String { key }
}

/// Where a line's value comes from, which decides how it is drawn: a
/// calculated or overridden value says so under it, and a value the phone
/// cannot vouch for is muted.
internal enum InventoryDetailFieldSource: Equatable {
    case recorded
    case calculated
    case overridden
    case unavailable
    case outOfDate

    internal var caption: String? {
        switch self {
        case .calculated: "Calculated"
        case .overridden: "Overridden"
        case .recorded, .unavailable, .outOfDate: nil
        }
    }

    internal var isMuted: Bool { self == .unavailable || self == .outOfDate }
}

/// A photograph by content hash, and what the lightbox captions it with.
internal struct InventoryDetailPhoto: Identifiable, Equatable {
    internal let sha256: String
    internal let caption: String

    internal var id: String { sha256 }
}

extension Array where Element == InventoryDetailPhoto {
    /// This item's photos, in their current order, with `sha256` swapped one
    /// step `direction`. Nil when `sha256` names none of them, or is already
    /// at that end.
    internal func reorderedIds(
        moving sha256: String, _ direction: InventoryPhotoReorderDirection
    ) -> [String]? {
        let ids = map(\.sha256)
        guard let index = ids.firstIndex(of: sha256) else { return nil }
        let target = direction == .earlier ? index - 1 : index + 1
        guard ids.indices.contains(target) else { return nil }
        var reordered = ids
        reordered.swapAt(index, target)
        return reordered
    }
}

/// Provenance as the section reads it, already formatted.
internal struct InventoryDetailProvenance: Equatable {
    internal let merchant: String?
    internal let price: String?
    internal let purchasedOn: String?
    internal let hasReceipt: Bool
    internal let warranty: String?
}

/// What a container holds, from its own page: a summary and the way in.
internal struct InventoryContainerSummary: Equatable {
    internal let itemCount: Int
    internal let containerCount: Int
}

/// An open repair on this item: what happened, in one line, and the one
/// choice that keeps this phone's change. `resolution` is nil for a repair
/// kind this build does not know, which offers no inline fix.
internal struct InventoryDetailConflict: Equatable {
    internal let repairId: InventoryRepair.ID
    internal let problem: String
    internal let resolution: String?
    internal let choice: InventoryRepairChoice
}

/// Everything Item detail shows about one item, read from one state.
internal struct InventoryItemDetail: Identifiable, Equatable {
    internal let record: InventoryDetailRecord
    internal let photos: [InventoryDetailPhoto]
    internal let externalIdentifiers: [InventoryExternalIdentifier]
    internal let note: String?
    /// The fields the type's descriptor marks highlighted, in its order,
    /// which sit beside the placement.
    internal let highlightedFields: [InventoryDetailField]
    /// Every other recorded field, shown under the actions as Details.
    internal let otherFields: [InventoryDetailField]
    internal let containerSummary: InventoryContainerSummary?
    internal let provenance: InventoryDetailProvenance?
    internal let documents: InventoryDocumentsStatus
    internal let activity: [InventoryActivityEntry]
    internal let conflict: InventoryDetailConflict?
    /// How long ago the replica last caught up, when it has gone stale.
    internal let lastSynced: String?
    /// When and why an inactive item stopped counting.
    internal let lifecycleChange: InventoryLifecycleChange?

    internal var id: String { record.id }

    /// The line under the name: what kind of thing it is, and how many the
    /// record stands for when that is not one.
    internal var subtitle: String {
        var parts = [record.typeName ?? "No type yet"]
        if record.quantity.count != 1 { parts.append("\(record.quantity.count) in this group") }
        return parts.joined(separator: " · ")
    }
}
