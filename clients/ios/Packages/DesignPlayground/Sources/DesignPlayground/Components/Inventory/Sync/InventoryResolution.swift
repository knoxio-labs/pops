/// One way out of a disagreement, and what taking it costs.
///
/// A resolution always says what will happen, never only what it is called:
/// "Keep mine" and "Keep the server's" are the same three words to a reader
/// who does not already know which of their afternoons is about to be thrown
/// away. The outcome sentence is the component's whole point, so it is not
/// optional.
internal struct InventoryResolution: Identifiable, Equatable {
    /// What the change actually does, which is what decides how it is drawn
    /// and what the tests can assert about a conflict without reading prose.
    internal enum Effect: Equatable {
        /// The phone's intent wins.
        case keepsLocal
        /// The server's value wins and the local intent is dropped with it.
        case keepsServer
        /// Both survive: a second record, a new code, a merge.
        case keepsBoth
        /// The person writes the final value themselves.
        case reopensEditor
        /// Rebuilds the thing the change needed before replaying it.
        case restoresTarget
        case resumesSession
        case updatesApp
        /// Leaves it for later, unchanged and still queued.
        case postpones
        /// Throws the local change away. The only effect that loses work, so
        /// no conflict offers it first and most do not offer it at all.
        case discardsIntent
    }

    internal let id: String
    internal let title: String
    /// What happens when it is tapped, in one sentence, in the reader's terms.
    internal let outcome: String
    internal let effect: Effect

    internal init(_ id: String, _ title: String, outcome: String, effect: Effect) {
        self.id = id
        self.title = title
        self.outcome = outcome
        self.effect = effect
    }

    /// Every conflict ends with this one. A person who cannot decide now has
    /// to be able to leave without the screen taking the decision for them.
    internal static let postpone = InventoryResolution(
        "postpone", "Not now",
        outcome: "Stays here, unchanged, and keeps waiting.", effect: .postpones)
}

/// The resolutions each kind of disagreement offers, in the order they are
/// listed.
///
/// First is the one a person most often wants and the one the screen leads
/// with; last is always ``InventoryResolution/postpone``. Nothing that loses
/// work is ever first, and a kind where nothing has to be lost does not offer
/// losing it at all.
internal enum InventoryResolutions {
    internal static func offered(for kind: InventoryConflictKind) -> [InventoryResolution] {
        switch kind {
        case .concurrentEdit: concurrentEdit
        case .remoteDeletion: remoteDeletion
        case .codeCollision: codeCollision
        case .validation: validation
        case .expiredSession: expiredSession
        case .missingDependency: missingDependency
        case .storageFull: storageFull
        case .unsupportedContract: unsupportedContract
        case .deviceDivergence: deviceDivergence
        }
    }

    private static let concurrentEdit = [
        InventoryResolution(
            "keep-mine", "Keep what I did",
            outcome: "The router stays in Office 04. The web's move is undone.",
            effect: .keepsLocal),
        InventoryResolution(
            "keep-server", "Keep the other change",
            outcome: "The router goes to the hall cupboard. Your move is dropped.",
            effect: .keepsServer),
        InventoryResolution(
            "choose-place", "Put it somewhere else",
            outcome: "Opens the place picker so neither guess has to win.",
            effect: .reopensEditor),
        .postpone,
    ]

    private static let remoteDeletion = [
        InventoryResolution(
            "restore-target", "Put the container back",
            outcome: "Recreates Office 04 on the server, then replays the move into it.",
            effect: .restoresTarget),
        InventoryResolution(
            "choose-place", "Choose another place",
            outcome: "Opens the place picker for the 6 items that were going in.",
            effect: .reopensEditor),
        InventoryResolution(
            "drop", "Drop the move",
            outcome: "The 6 items stay where they were. The move is thrown away.",
            effect: .discardsIntent),
        .postpone,
    ]

    private static let codeCollision = [
        InventoryResolution(
            "relabel", "Give this one a new code",
            outcome: "Both boxes survive. This one gets the next free code to print.",
            effect: .keepsBoth),
        InventoryResolution(
            "claim-code", "This box keeps B412",
            outcome: "The other box loses the code and shows as unlabelled until relabelled.",
            effect: .keepsLocal),
        .postpone,
    ]

    private static let validation = [
        InventoryResolution(
            "edit-value", "Fix the quantity",
            outcome: "Opens the item with the quantity selected. Nothing else changes.",
            effect: .reopensEditor),
        InventoryResolution(
            "keep-server", "Leave it at 120",
            outcome: "The server's count stands and your edit is dropped.",
            effect: .keepsServer),
        .postpone,
    ]

    private static let expiredSession = [
        InventoryResolution(
            "sign-in", "Sign in again",
            outcome: "Unlocks POPS and sends all 14 waiting changes in order.",
            effect: .resumesSession),
        .postpone,
    ]

    private static let missingDependency = [
        InventoryResolution(
            "send-dependency", "Send the container first",
            outcome: "Creates Moving crate 3 on the server, then replays the 9 changes behind it.",
            effect: .keepsLocal),
        InventoryResolution(
            "choose-place", "Choose another place",
            outcome: "Opens the place picker and repoints all 9 changes at once.",
            effect: .reopensEditor),
        .postpone,
    ]

    private static let storageFull = [
        InventoryResolution(
            "send-without-photos", "Send the changes, keep the photos here",
            outcome:
                "All 11 changes land now. The 14 photos stay on this phone until there is room.",
            effect: .keepsLocal),
        InventoryResolution(
            "review-photos", "Review the photos",
            outcome: "Opens the 14 staged photos, largest first, so you choose what to drop.",
            effect: .reopensEditor),
        .postpone,
    ]

    private static let unsupportedContract = [
        InventoryResolution(
            "update-app", "Update POPS",
            outcome: "Opens the App Store. Your 11 changes are kept and sent after the update.",
            effect: .updatesApp),
        .postpone,
    ]

    private static let deviceDivergence = [
        InventoryResolution(
            "merge", "Keep both edits",
            outcome: "Takes the name from this phone and the place from the tablet.",
            effect: .keepsBoth),
        InventoryResolution(
            "keep-mine", "Keep this phone's version",
            outcome: "Name and place both come from here. The tablet's edit is undone.",
            effect: .keepsLocal),
        InventoryResolution(
            "keep-other", "Keep the tablet's version",
            outcome: "Name and place both come from the tablet. Your edit is dropped.",
            effect: .keepsServer),
        .postpone,
    ]
}
