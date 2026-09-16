import Foundation

/// The words POPS-3989 adds on top of ADR-001's lifecycle axis.
///
/// The ADR closes the lifecycle vocabulary itself: active, retired, discarded,
/// lost, destroyed, and nothing here adds a sixth. What was left open is what
/// a *discard* was for, and that is a reason carried alongside the state, not
/// a state of its own: see ``InventoryLifecycleExperiments``'s
/// `reasonPresentation` question for why that is still being decided rather
/// than assumed.

/// Why an item was discarded. Always attached to `.discarded`, never a
/// lifecycle value by itself.
internal enum InventoryDiscardReason: String, CaseIterable, Hashable, Identifiable {
    case donated
    case sold
    case consumed
    case broken
    case gifted
    case other

    internal var id: String { rawValue }

    internal var label: String {
        switch self {
        case .donated: "Donated"
        case .sold: "Sold"
        case .consumed: "Used up"
        case .broken: "Broke"
        case .gifted: "Gave away"
        case .other: "Other"
        }
    }

    internal var symbol: InventorySymbol {
        switch self {
        case .donated: .donated
        case .sold: .sold
        case .consumed: .consumed
        case .broken, .other: .discard
        case .gifted: .donated
        }
    }
}

/// What a lifecycle-changing action asks for before it happens: why, when,
/// anything worth writing down, and, for a grouped record, how many of the
/// items the answer covers.
internal struct InventoryDispositionDraft: Equatable {
    internal var reason: InventoryDiscardReason?
    internal var note: String = ""
    internal var date: Date = .now
    /// Nil for a record of one. For a group, how many of `totalCount` this
    /// disposition covers; the rest stays active.
    internal var quantityRemoved: Int?
    internal let totalCount: Int

    internal init(totalCount: Int, reason: InventoryDiscardReason? = nil) {
        self.totalCount = totalCount
        self.reason = reason
        self.quantityRemoved = totalCount > 1 ? totalCount : nil
    }

    /// Whether this draft removes every unit the record stands for, which is
    /// what turns the record itself inactive rather than merely smaller.
    internal var disposesOfWholeRecord: Bool {
        guard let quantityRemoved else { return true }
        return quantityRemoved >= totalCount
    }

    internal var remainingAfter: Int {
        max(0, totalCount - (quantityRemoved ?? totalCount))
    }
}

/// Something that happened to an item, structured rather than three strings
/// glued together, so a timeline can offer more than ``InventoryActivityRow``
/// shows without a second model for the extra detail.
internal struct InventoryTimelineEvent: Identifiable, Equatable {
    internal enum Kind: Equatable {
        case placement
        case lifecycle
        case sync
    }

    internal let id: String
    internal let kind: Kind
    internal let verb: String
    internal let subject: String
    internal let detail: String
    internal let when: String
    /// What a drill-in shows that the compact row does not: the full account
    /// of the change, including anything a reason or note captured.
    internal let fullDetail: String
    /// Whether this event itself was undoing an earlier one, so a timeline can
    /// say "restored" in the same voice it said "discarded".
    internal let isReversal: Bool

    internal init(
        id: String,
        kind: Kind,
        verb: String,
        subject: String,
        detail: String,
        when: String,
        fullDetail: String? = nil,
        isReversal: Bool = false
    ) {
        self.id = id
        self.kind = kind
        self.verb = verb
        self.subject = subject
        self.detail = detail
        self.when = when
        self.fullDetail = fullDetail ?? detail
        self.isReversal = isReversal
    }
}
