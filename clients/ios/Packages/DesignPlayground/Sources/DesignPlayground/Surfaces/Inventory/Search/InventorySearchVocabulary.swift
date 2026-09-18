import Foundation

/// What POPS-3982 adds to the vocabulary: the field a query matched, and the
/// metadata search reads that ``InventoryFoundationItem`` does not carry.
///
/// External identifiers and notes are not added to ``InventoryFoundationItem``
/// itself, because those fields belong to the type work POPS-3983 and
/// POPS-4016 own; search only reads them, so they live in a record that wraps
/// the item rather than in the item.

/// One thing search can find that is an item. A container is an item
/// (ADR-001); the kind only decides the row's mark and where it opens.
internal enum InventorySearchKind: Equatable {
    case item
    case container
}

/// The field a query matched, so a result can say why it is here.
internal enum InventorySearchFacet: CaseIterable, Equatable {
    case name
    case inventoryCode
    case externalIdentifier
    case note
    case typeName
    case capability
    case placement
}

/// An item or container, with the metadata search reads that the row does
/// not otherwise carry.
internal struct InventorySearchRecord: Identifiable, Equatable {
    internal let item: InventoryFoundationItem
    internal let kind: InventorySearchKind
    internal let externalIdentifier: String?
    internal let note: String?
    internal let capabilities: [String]
    internal let photo: Data?
    /// Days since the record was created, for the Items browser's recent
    /// ordering and its recently-added count.
    internal let addedDaysAgo: Int

    internal var id: String { item.id }

    internal init(
        item: InventoryFoundationItem,
        externalIdentifier: String? = nil,
        note: String? = nil,
        capabilities: [String] = [],
        photo: Data? = nil,
        addedDaysAgo: Int = 30
    ) {
        self.item = item
        self.kind = item.isContainer ? .container : .item
        self.externalIdentifier = externalIdentifier
        self.note = note
        self.capabilities = capabilities
        self.photo = photo
        self.addedDaysAgo = addedDaysAgo
    }

    internal var isRecent: Bool { addedDaysAgo <= 7 }

    /// Where the record is, as one line a row can wrap.
    internal var placementLine: String {
        let crumbs = item.placement.crumbs
        if item.placement.isInHand { return "In hand" }
        return crumbs.isEmpty ? "Unplaced" : crumbs.joined(separator: " › ")
    }

    /// The type and the placement, the row's second line.
    internal var detailLine: String {
        [item.typeName ?? "No type", placementLine].joined(separator: " · ")
    }
}
