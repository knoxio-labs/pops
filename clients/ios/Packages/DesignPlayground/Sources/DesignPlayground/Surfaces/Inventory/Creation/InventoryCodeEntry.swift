import Foundation

/// An inventory code being entered, and what the suggestion is doing about it.
///
/// A code is assigned by choice rather than declared by a type (ADR-001), so
/// every draft starts without one and an item created without one is finished
/// rather than incomplete. That is why nothing here is required: the only
/// state that blocks a create is a code already worn by something else.
internal struct InventoryCodeEntry: Equatable {
    internal var value: String
    internal var assist: InventoryCodeAssist

    internal init(value: String = "", assist: InventoryCodeAssist = .idle) {
        self.value = value
        self.assist = assist
    }

    /// Whether this draft will carry a code at all. A blank field is the
    /// ordinary case, not a gap.
    internal var isLabelled: Bool {
        !value.trimmingCharacters(in: .whitespaces).isEmpty
    }
}

/// What the suggestion has done, is doing, or could not do.
///
/// One value rather than a bag of flags, because the states exclude one
/// another and a screen that can be both offering and offline at once is a
/// screen nobody can read.
internal enum InventoryCodeAssist: Equatable {
    /// Nothing asked. The field is the person's alone.
    case idle
    case suggesting
    /// A code proposed, with the runners-up behind it.
    case offered(alternatives: [String])
    case accepted
    /// Offered and declined. The field stays blank and says nothing further.
    case rejected
    /// Accepted, then typed over. `suggested` is what was offered, kept so the
    /// screen can say the code is no longer the one the suggestion made.
    case edited(suggested: String)
    /// The code in the field already belongs to something else.
    case collision(existing: String)
    /// No connection, so no suggestion. Typing one by hand still works.
    case offline
    case unavailable(reason: String)

    /// The only assist state that stops a create. Everything else is a
    /// position on a code that is optional anyway.
    internal var blocksCreation: Bool {
        guard case .collision = self else { return false }
        return true
    }

    internal var isWorking: Bool { self == .suggesting }

    /// What the row says under the field. Nil where the field alone is the
    /// whole story, which is most of the time.
    internal var note: String? {
        switch self {
        case .idle, .accepted: nil
        case .suggesting: "Looking for a free code"
        case .offered: "Suggested. Take it, pick another, or type your own."
        case .rejected: "Suggestion dismissed. Type a code, or leave it unlabelled."
        case .edited(let suggested): "Changed from the suggested \(suggested)."
        case .collision(let existing): "\(existing) already carries this code."
        case .offline: "Offline, so no code can be suggested. Type one, or do it later."
        case .unavailable(let reason): reason
        }
    }

    /// The suggestion's runners-up, when it made any.
    internal var alternatives: [String] {
        guard case .offered(let alternatives) = self else { return [] }
        return alternatives
    }
}
