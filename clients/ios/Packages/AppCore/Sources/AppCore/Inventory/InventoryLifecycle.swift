import Foundation

/// Whether an item still exists and counts. Independent of access: a closed
/// box is not a retired one (ADR-002 D3).
///
/// Sent on the wire as an open string because a lifecycle value can grow
/// without a protocol bump being required for every server deploy (D10), so
/// this decodes an unknown one to `.unrecognised` rather than refusing it.
public enum InventoryLifecycle: Hashable, Sendable {
    case active
    case retired
    case discarded
    case lost
    case destroyed
    /// A lifecycle value this build has never heard of, kept verbatim.
    case unrecognised(String)

    public init(wire: String) {
        switch wire {
        case "active": self = .active
        case "retired": self = .retired
        case "discarded": self = .discarded
        case "lost": self = .lost
        case "destroyed": self = .destroyed
        default: self = .unrecognised(wire)
        }
    }

    /// The inverse of `init(wire:)`. An `.unrecognised` value round-trips its
    /// own string rather than being unrepresentable on the way back out —
    /// this build cannot have chosen it (nothing offers it as an option), so
    /// the only way here is replaying a value this app already received.
    public var wireValue: String {
        switch self {
        case .active: "active"
        case .retired: "retired"
        case .discarded: "discarded"
        case .lost: "lost"
        case .destroyed: "destroyed"
        case .unrecognised(let raw): raw
        }
    }

    /// Whether the item is part of "what I have". Only active items are; an
    /// unrecognised value is treated the same as an inactive one, because
    /// counting it towards totals would be a guess this type cannot make.
    public var countsTowardTotals: Bool { self == .active }

    /// Whether the state can be walked back from the phone. Destroyed is a
    /// fact about the world rather than a decision about the record, so
    /// nothing restores it; the others were choices, and choices can be
    /// undone. An unrecognised value offers no restore, matching the server's
    /// authority over transitions it has not told this build about.
    public var isRestorable: Bool {
        switch self {
        case .active, .destroyed, .unrecognised: false
        case .retired, .discarded, .lost: true
        }
    }
}

/// Why an item was discarded, recorded only on the lifecycle-change event
/// (D3): the badge stays the lifecycle word, so a donated jacket reads
/// Discarded wherever it is listed.
public enum InventoryDiscardReason: Hashable, Sendable {
    case donated
    case sold
    case usedUp
    case broken
    case gaveAway
    case unrecognised(String)

    public init(wire: String) {
        switch wire {
        case "donated": self = .donated
        case "sold": self = .sold
        case "used_up": self = .usedUp
        case "broken": self = .broken
        case "gave_away": self = .gaveAway
        default: self = .unrecognised(wire)
        }
    }

    /// The inverse of `init(wire:)`, for the same reason `InventoryLifecycle`
    /// carries one.
    public var wireValue: String {
        switch self {
        case .donated: "donated"
        case .sold: "sold"
        case .usedUp: "used_up"
        case .broken: "broken"
        case .gaveAway: "gave_away"
        case .unrecognised(let raw): raw
        }
    }
}

/// When an item left "what I have", and why when a discard said.
public struct InventoryLifecycleChange: Hashable, Sendable {
    public let lifecycle: InventoryLifecycle
    public let changedAt: Date
    public let reason: InventoryDiscardReason?

    public init(lifecycle: InventoryLifecycle, changedAt: Date, reason: InventoryDiscardReason?) {
        self.lifecycle = lifecycle
        self.changedAt = changedAt
        self.reason = reason
    }
}
