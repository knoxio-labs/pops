/// The staged flow's steps, in the order a person walks them.
///
/// Identity first because a name is the one required thing; photographs next
/// because that is the moment the object is still in hand; placement after,
/// because it is the answer most likely to change while you are carrying it;
/// review last because the record is created there and nowhere earlier.
internal enum InventoryCreateStep: String, CaseIterable, Identifiable {
    case identity
    case photos
    case placement
    case review

    internal var id: String { rawValue }

    internal var title: String {
        switch self {
        case .identity: "What is it"
        case .photos: "Photos"
        case .placement: "Where it goes"
        case .review: "Review"
        }
    }

    /// Where the step number comes from, so the header and the progress bar
    /// cannot disagree about which step this is.
    internal var position: Int {
        (Self.allCases.firstIndex(of: self) ?? 0) + 1
    }

    internal var isFinal: Bool { self == .review }

    internal var next: InventoryCreateStep? {
        Self.allCases.first { $0.position == position + 1 }
    }

    internal var previous: InventoryCreateStep? {
        Self.allCases.first { $0.position == position - 1 }
    }
}

/// What happened after the final action.
///
/// The sync axis and the failure states are separate values here for the same
/// reason ADR-001 keeps them apart: a record that is queued is a success that
/// has not travelled yet, and one the server argued with is not.
internal enum InventoryCreateOutcome: Equatable {
    /// Written locally and on its way, at whichever sync state.
    case created(InventorySync)
    /// The server holds a different answer to something entered here.
    case validationChanged(field: String, serverValue: String)
    /// The record exists and something about it needs a choice.
    case repairRequired(String)

    internal var sync: InventorySync {
        switch self {
        case .created(let sync): sync
        case .validationChanged: .stale
        case .repairRequired: .needsAttention
        }
    }

    internal var headline: String {
        switch self {
        case .created(.queued): "Created, waiting to sync"
        case .created(.synchronizing): "Created, syncing"
        case .created: "Created"
        case .validationChanged: "Created, with one disagreement"
        case .repairRequired: "Created, and one change needs you"
        }
    }

    internal var message: String? {
        switch self {
        case .created(.queued):
            "It is on this phone and counts already. It reaches the server when there is a signal."
        case .created: nil
        case .validationChanged(let field, let value):
            "The server already had \(field) as \(value). Keep yours, or take theirs."
        case .repairRequired(let reason): reason
        }
    }
}
