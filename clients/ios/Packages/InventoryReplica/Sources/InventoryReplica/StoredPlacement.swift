import AppCore

/// `InventoryPlacement`'s storage twin, for a move event's `before` and
/// `after`, which carry placements alongside catalogue-typed fields.
internal enum StoredPlacement: Codable {
    case location(String)
    case container(String)
    case hand

    init(_ placement: InventoryPlacement) {
        switch placement {
        case .location(let id): self = .location(id)
        case .container(let id): self = .container(id)
        case .hand: self = .hand
        }
    }

    var domainValue: InventoryPlacement {
        switch self {
        case .location(let id): .location(id)
        case .container(let id): .container(id)
        case .hand: .hand
        }
    }
}

/// `InventoryPreviousPlacement`'s storage twin, for the same reason.
internal enum StoredPreviousPlacement: Codable {
    case location(String)
    case container(String)
    case tombstoned

    init(_ previous: InventoryPreviousPlacement) {
        switch previous {
        case .location(let id): self = .location(id)
        case .container(let id): self = .container(id)
        case .tombstoned: self = .tombstoned
        }
    }

    var domainValue: InventoryPreviousPlacement {
        switch self {
        case .location(let id): .location(id)
        case .container(let id): .container(id)
        case .tombstoned: .tombstoned
        }
    }
}
