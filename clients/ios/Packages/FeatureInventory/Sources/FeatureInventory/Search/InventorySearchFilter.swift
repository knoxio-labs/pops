import AppCore

/// Where a record is, as the filter sheet narrows it.
internal enum InventoryPlacementFilter: String, CaseIterable, Identifiable, Sendable {
    case any, inHand, direct, contained

    internal var id: String { rawValue }

    internal var title: String {
        switch self {
        case .any: "Anywhere"
        case .inHand: "In hand"
        case .direct: "In a place"
        case .contained: "In a container"
        }
    }
}

internal enum InventoryContainerStateFilter: String, CaseIterable, Identifiable, Sendable {
    case any, open, closed

    internal var id: String { rawValue }

    internal var title: String {
        switch self {
        case .any: "Any"
        case .open: "Open"
        case .closed: "Closed"
        }
    }
}

/// The quantity narrowing. The approved sheet also drew "None left", but the
/// server never stores fewer than one of anything, so that option could
/// never match a row and is not offered.
internal enum InventoryQuantityFilter: String, CaseIterable, Identifiable, Sendable {
    case any, several

    internal var id: String { rawValue }

    internal var title: String {
        switch self {
        case .any: "Any"
        case .several: "More than one"
        }
    }
}

internal enum InventoryMissingFilter: String, CaseIterable, Identifiable, Sendable {
    case nothing, type, code, photo

    internal var id: String { rawValue }

    internal var title: String {
        switch self {
        case .nothing: "Any"
        case .type: "No type"
        case .code: "No code"
        case .photo: "No photo"
        }
    }
}

internal enum InventorySyncFilter: String, CaseIterable, Identifiable, Sendable {
    case any, waiting, stale, needsAttention

    internal var id: String { rawValue }

    internal var title: String {
        switch self {
        case .any: "Any"
        case .waiting: "Waiting"
        case .stale: "Out of date"
        case .needsAttention: "Needs attention"
        }
    }
}

/// Every narrowing the filter sheet offers, as one value. Each field is
/// independent and all of them must hold. Inactive records (retired,
/// discarded, lost, destroyed) are left out unless `includesInactive` is on,
/// whatever else is set.
public struct InventorySearchFilter: Equatable, Sendable {
    internal var placement = InventoryPlacementFilter.any
    internal var containerState = InventoryContainerStateFilter.any
    internal var type: InventoryTypeName?
    internal var quantity = InventoryQuantityFilter.any
    internal var missing = InventoryMissingFilter.nothing
    internal var sync = InventorySyncFilter.any
    internal var includesInactive = false

    /// Creates a filter that includes active records in every placement.
    public init() {}

    /// Whether any narrowing differs from the default filter.
    public var isActive: Bool { self != InventorySearchFilter() }

    /// What VoiceOver reads as the filter circle's value.
    public var summary: String {
        [
            placement == .any ? nil : placement.title,
            containerState == .any ? nil : containerState.title,
            type?.name,
            quantity == .any ? nil : quantity.title,
            missing == .nothing ? nil : missing.title,
            sync == .any ? nil : sync.title,
            includesInactive ? "Including inactive" : nil,
        ]
        .compactMap(\.self)
        .joined(separator: ", ")
    }

    internal func matches(_ record: InventoryRecord) -> Bool {
        (includesInactive || record.isActive)
            && matchesPlacement(record.placement)
            && matchesContainer(record.access)
            && (type == nil || record.typeKey == type?.key)
            && (quantity == .any || record.quantity.count > 1)
            && matchesMissing(record)
            && matchesSync(record.sync)
    }

    private func matchesPlacement(_ placement: InventoryRecord.Placement) -> Bool {
        switch (self.placement, placement) {
        case (.any, _), (.inHand, .hand), (.direct, .location), (.contained, .container): true
        default: false
        }
    }

    private func matchesContainer(_ access: InventoryAccess?) -> Bool {
        switch containerState {
        case .any: true
        case .open: access == .open
        case .closed: access == .closed
        }
    }

    private func matchesMissing(_ record: InventoryRecord) -> Bool {
        switch missing {
        case .nothing: true
        case .type: record.typeKey == nil
        case .code: record.code == nil
        case .photo: record.photo == nil
        }
    }

    private func matchesSync(_ sync: InventorySync) -> Bool {
        switch self.sync {
        case .any: true
        case .waiting: sync == .queued || sync == .saved || sync == .synchronizing
        case .stale: sync == .stale
        case .needsAttention: sync == .needsAttention
        }
    }
}

/// How the Items browser orders and sections its list.
internal enum InventoryItemSort: String, CaseIterable, Identifiable, Sendable {
    case recent, name

    internal var id: String { rawValue }

    internal var title: String {
        switch self {
        case .recent: "Recently added"
        case .name: "Name"
        }
    }
}
