/// What POPS-3982 adds to the vocabulary: the field a query matched, and the
/// metadata search reads that ``InventoryFoundationItem`` does not carry.
///
/// External identifiers and notes are not added to ``InventoryFoundationItem``
/// itself, because those fields belong to the type work POPS-3983 and
/// POPS-4016 own; search only reads them, so they live in a record that wraps
/// the item rather than in the item.

/// One thing search can find.
///
/// A container is an item (ADR-001), but search treats it as its own kind
/// because a reviewer searching for a box means something different from
/// searching for what is in it, see the grouping experiment.
internal enum InventorySearchKind: Equatable {
    case item
    case container
}

/// The field a query matched, so a result can say why it is here rather than
/// asking the reader to guess.
internal enum InventorySearchFacet: CaseIterable, Equatable {
    case name
    case inventoryCode
    case externalIdentifier
    case note
    case typeName
    case capability
    case placement

    internal var label: String {
        switch self {
        case .name: "Name"
        case .inventoryCode: "Inventory code"
        case .externalIdentifier: "External identifier"
        case .note: "Note"
        case .typeName: "Type"
        case .capability: "Capability"
        case .placement: "Placement"
        }
    }
}

/// An item or container, with the metadata search reads that the row does
/// not otherwise carry.
internal struct InventorySearchRecord: Identifiable, Equatable {
    internal let item: InventoryFoundationItem
    internal let kind: InventorySearchKind
    internal let externalIdentifier: String?
    internal let note: String?
    internal let capabilities: [String]

    internal var id: String { item.id }

    internal init(
        item: InventoryFoundationItem,
        externalIdentifier: String? = nil,
        note: String? = nil,
        capabilities: [String] = []
    ) {
        self.item = item
        self.kind = item.isContainer ? .container : .item
        self.externalIdentifier = externalIdentifier
        self.note = note
        self.capabilities = capabilities
    }
}

/// A place in the home (ADR-001: a location is not an item). Search matches
/// it on name alone, a location has no code, no type and no capabilities.
internal struct InventoryLocationRecord: Identifiable, Equatable {
    internal let id: String
    internal let name: String
    internal let parentID: String?
    internal let itemCount: Int
    internal let containerCount: Int

    internal func matches(_ query: String) -> Bool {
        name.localizedCaseInsensitiveContains(query)
    }
}
