import Foundation

/// One field an edit moved, as the two values a reader compares.
internal struct GuestFieldChange: Hashable, Sendable, Identifiable {
    internal let field: String
    internal let before: String
    internal let after: String

    internal var id: String { field }
}

/// One line of the audit log: who did what to which entry, and when.
internal struct GuestHistoryEvent: Hashable, Sendable, Identifiable {
    internal enum Action: Hashable, Sendable {
        case created
        case updated
        case deleted
        case restored
    }

    internal enum Actor: Hashable, Sendable {
        case you
        case other(String)
    }

    internal let id: String
    internal let entryID: String
    internal let subject: String
    internal let action: Action
    internal let actor: Actor
    internal let at: Date
    internal let changes: [GuestFieldChange]

    internal init(
        id: String, entryID: String, subject: String, action: Action, actor: Actor, at: Date,
        changes: [GuestFieldChange] = []
    ) {
        self.id = id
        self.entryID = entryID
        self.subject = subject
        self.action = action
        self.actor = actor
        self.at = at
        self.changes = changes
    }

    /// The deletions nothing has undone since. Those are the only rows that
    /// say where restoring happens, because a restored entry needs no
    /// recovery and the phone offers none.
    internal static func awaitingRestore(in events: [GuestHistoryEvent]) -> Set<ID> {
        var latest: [String: GuestHistoryEvent] = [:]
        for event in events where event.action == .deleted || event.action == .restored {
            if let known = latest[event.entryID], known.at >= event.at { continue }
            latest[event.entryID] = event
        }
        return Set(latest.values.filter { $0.action == .deleted }.map(\.id))
    }
}

/// Whether a log is read on one entry or across a whole account. Across an
/// account each line has to name its entry; on one entry that would repeat
/// the page title on every row.
internal enum GuestHistoryScope: Hashable, Sendable {
    case entry
    case account
}

internal enum GuestHistoryCopy {
    internal static let entryTitle = "History"
    internal static let accountTitle = "Activity"
    internal static let empty = "Nothing has been recorded yet."
    internal static let loading = "Loading history…"
    internal static let failed = "The history could not be loaded."
    internal static let retry = "Retry"
    internal static let restoreElsewhere = "Deleted entries are restored on the website."

    internal static func symbol(for action: GuestHistoryEvent.Action) -> String {
        switch action {
        case .created: "plus.circle"
        case .updated: "pencil.circle"
        case .deleted: "trash.circle"
        case .restored: "arrow.uturn.backward.circle"
        }
    }

    internal static func headline(_ event: GuestHistoryEvent, scope: GuestHistoryScope) -> String {
        let who = name(event.actor)
        let what = scope == .account ? event.subject : "this"
        switch event.action {
        case .created: return "\(who) added \(what)"
        case .deleted: return "\(who) deleted \(what)"
        case .restored: return "\(who) restored \(what)"
        case .updated:
            guard scope == .entry else { return "\(who) changed \(what)" }
            return "\(who) changed \(changed(event.changes))"
        }
    }

    private static func name(_ actor: GuestHistoryEvent.Actor) -> String {
        switch actor {
        case .you: "You"
        case .other(let name): name
        }
    }

    private static func changed(_ changes: [GuestFieldChange]) -> String {
        let fields = changes.map { $0.field.lowercased() }
        switch fields.count {
        case 0: return "this"
        case 1: return "the \(fields[0])"
        case 2: return "the \(fields[0]) and \(fields[1])"
        default: return "\(fields.count) details"
        }
    }
}
