/// The nine ways a change made on this phone can come back unaccepted.
///
/// Named by what happened rather than by what failed, because "an error
/// occurred" is not a repair: a reader can only act on a sentence that says
/// which item, what disagreed, and what is on offer. Every kind here has all
/// three, and ``InventoryResolutions`` holds the third.
internal enum InventoryConflictKind: String, CaseIterable, Identifiable {
    /// Someone changed the same field on the web while this phone was away.
    case concurrentEdit
    /// The thing the change pointed at is gone from the server.
    case remoteDeletion
    /// Two records claim one inventory code.
    case codeCollision
    /// The server will not take the value.
    case validation
    /// The session ran out before the queue drained.
    case expiredSession
    /// The change names something that has not been created on the server yet.
    case missingDependency
    /// There is no room left for the staged media.
    case storageFull
    /// This app is older than the contract the server now speaks.
    case unsupportedContract
    /// Two devices edited different fields of one item while both were away.
    case deviceDivergence

    internal var id: String { rawValue }

    /// The repair's heading: what happened, in the reader's terms, no verdict.
    internal var headline: String {
        switch self {
        case .concurrentEdit: "Moved in two places"
        case .remoteDeletion: "Its container is gone"
        case .codeCollision: "Two boxes, one code"
        case .validation: "The count was refused"
        case .expiredSession: "POPS needs you to sign in"
        case .missingDependency: "Waiting on a container"
        case .storageFull: "No room for the photos"
        case .unsupportedContract: "This app is behind"
        case .deviceDivergence: "Edited on two devices"
        }
    }

    /// What disagreed, stated before anything is on offer.
    internal var disagreement: String {
        switch self {
        case .concurrentEdit:
            "You moved it to Office 04 here. On the web it was moved to the hall cupboard."
        case .remoteDeletion:
            "Office 04 was deleted on the web while you were moving 6 items into it."
        case .codeCollision:
            "B412 was printed for this box here, and for a different box on the web."
        case .validation:
            "You set the count to 1,400. The server keeps counts under 1,000 per record."
        case .expiredSession:
            "The session ended before the queue drained. Nothing was lost."
        case .missingDependency:
            "Moving crate 3 was created offline and has not reached the server yet."
        case .storageFull:
            "14 staged photos need 480 MB. This phone has 62 MB free."
        case .unsupportedContract:
            "The server speaks a newer catalogue format than this app can send."
        case .deviceDivergence:
            "You renamed it here. The tablet moved it. Neither edit saw the other."
        }
    }

    /// Whether this one blocks the whole queue rather than one operation.
    ///
    /// Drives what a screen may do about it and nothing else: a repair that
    /// stops everything is the candidate for interrupting somebody, which is
    /// the question ``InventorySyncStyle/Interruption`` asks.
    internal var stopsTheQueue: Bool {
        switch self {
        case .expiredSession, .storageFull, .unsupportedContract: true
        case .concurrentEdit, .remoteDeletion, .codeCollision, .validation, .missingDependency,
            .deviceDivergence:
            false
        }
    }
}

/// The two values that cannot both be true, side by side.
///
/// A comparison and not a diff: the reader is choosing between two things a
/// person did, so both sides are labelled by who did them, not by which is
/// "current".
internal struct InventoryDisagreement: Equatable {
    internal let field: String
    internal let onThisPhone: String
    internal let elsewhere: String
    /// Where the other value came from. "The web", "your tablet", "POPS".
    internal let elsewhereName: String
}

/// One repair: an item, what disagreed about it, and the ways out.
internal struct InventoryConflict: Identifiable, Equatable {
    internal let id: String
    internal let item: InventoryFoundationItem
    internal let kind: InventoryConflictKind
    /// Absent where nothing has two values, an expired session, a full disk.
    /// Those repairs are still repairs; they just have nothing to compare.
    internal let fields: [InventoryDisagreement]
    /// Other queued changes that cannot land until this one is settled.
    internal let heldCount: Int
    internal let when: String

    internal init(
        id: String,
        item: InventoryFoundationItem,
        kind: InventoryConflictKind,
        fields: [InventoryDisagreement] = [],
        heldCount: Int = 0,
        when: String
    ) {
        self.id = id
        self.item = item
        self.kind = kind
        self.fields = fields
        self.heldCount = heldCount
        self.when = when
    }

    internal var resolutions: [InventoryResolution] { InventoryResolutions.offered(for: kind) }

    /// The one the screen leads with. Never the one that loses work.
    internal var leading: InventoryResolution? { resolutions.first }

    /// What the row says under the item's name, including the cost of leaving
    /// it, which is the part a person needs before deciding to postpone.
    internal var summary: String {
        heldCount == 0
            ? kind.disagreement
            : "\(kind.disagreement) \(heldCount) later changes are waiting behind it."
    }
}
