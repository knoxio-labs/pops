/// Where a record is, as the filter sheet narrows it.
internal enum InventoryPlacementFilter: String, CaseIterable, Identifiable {
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

internal enum InventoryContainerStateFilter: String, CaseIterable, Identifiable {
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

internal enum InventoryQuantityFilter: String, CaseIterable, Identifiable {
    case any, several, noneLeft

    internal var id: String { rawValue }

    internal var title: String {
        switch self {
        case .any: "Any"
        case .several: "More than one"
        case .noneLeft: "None left"
        }
    }
}

internal enum InventoryMissingFilter: String, CaseIterable, Identifiable {
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

internal enum InventorySyncFilter: String, CaseIterable, Identifiable {
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
internal struct InventorySearchFilter: Equatable {
    internal var placement = InventoryPlacementFilter.any
    internal var containerState = InventoryContainerStateFilter.any
    internal var typeName: String?
    internal var quantity = InventoryQuantityFilter.any
    internal var missing = InventoryMissingFilter.nothing
    internal var sync = InventorySyncFilter.any
    internal var includesInactive = false

    internal var isActive: Bool { self != InventorySearchFilter() }

    /// What VoiceOver reads as the filter circle's value.
    internal var summary: String {
        [
            placement == .any ? nil : placement.title,
            containerState == .any ? nil : containerState.title,
            typeName,
            quantity == .any ? nil : quantity.title,
            missing == .nothing ? nil : missing.title,
            sync == .any ? nil : sync.title,
            includesInactive ? "Including inactive" : nil,
        ]
        .compactMap(\.self)
        .joined(separator: ", ")
    }

    internal func matches(_ record: InventorySearchRecord) -> Bool {
        let item = record.item
        return (includesInactive || item.lifecycle == .active)
            && matchesPlacement(item.placement)
            && matchesContainer(item.access)
            && InventoryFormType.includes(item.typeName, in: typeName)
            && matchesQuantity(item.quantity.count)
            && matchesMissing(record)
            && matchesSync(item.sync)
    }

    private func matchesPlacement(_ placement: InventoryPlacement) -> Bool {
        switch (self.placement, placement) {
        case (.any, _), (.inHand, .inHand), (.direct, .direct), (.contained, .contained): true
        default: false
        }
    }

    private func matchesContainer(_ access: InventoryAccess?) -> Bool {
        switch containerState {
        case .any: true
        case .open: access == .open
        case .closed: access == .closed || access == .sealed
        }
    }

    private func matchesQuantity(_ count: Int) -> Bool {
        switch quantity {
        case .any: true
        case .several: count > 1
        case .noneLeft: count < 1
        }
    }

    private func matchesMissing(_ record: InventorySearchRecord) -> Bool {
        switch missing {
        case .nothing: true
        case .type: record.item.typeName == nil
        case .code: record.item.code == nil
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
internal enum InventoryItemSort: String, CaseIterable, Identifiable {
    case recent, name

    internal var id: String { rawValue }

    internal var title: String {
        switch self {
        case .recent: "Recently added"
        case .name: "Name"
        }
    }
}
