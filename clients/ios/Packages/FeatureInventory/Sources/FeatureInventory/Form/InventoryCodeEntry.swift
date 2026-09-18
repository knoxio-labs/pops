/// An inventory code being entered, what the suggestion is doing about it,
/// and who already wears it.
///
/// A code is assigned by choice rather than declared by a type (ADR-001), so
/// every draft starts without one and an item created without one is finished
/// rather than incomplete. The only state that blocks a create is a code
/// already on something else, which is why `heldBy` sits beside the assist
/// rather than inside it: offline, a typed code is still checked against the
/// replica, so "offline" and "already used" can be true at once.
internal struct InventoryCodeEntry: Hashable, Sendable {
    internal var value: String
    internal var assist: InventoryCodeAssist
    /// The name of the item already carrying this code, when one does.
    internal var heldBy: String?

    internal init(value: String = "", assist: InventoryCodeAssist = .idle, heldBy: String? = nil) {
        self.value = value
        self.assist = assist
        self.heldBy = heldBy
    }

    /// The code as it will be stored: trimmed, or nil for a blank field,
    /// which is the ordinary case rather than a gap.
    internal var normalized: String? {
        let trimmed = value.trimmingCharacters(in: .whitespaces)
        return trimmed.isEmpty ? nil : trimmed
    }
}

/// What the suggestion has done, is doing, or could not do. The states
/// exclude one another, so one value rather than a bag of flags.
internal enum InventoryCodeAssist: Hashable, Sendable {
    /// Nothing asked. The field is the person's alone.
    case idle
    case suggesting
    /// A code proposed and put in the field, with the runners-up behind it.
    case offered(alternatives: [String])
    /// Offered, then cleared. The field stays blank and says nothing further.
    case rejected
    /// Offered, then typed over. `suggested` is what was offered.
    case edited(suggested: String)
    /// No connection, so no suggestion. Typing one by hand still works, and is
    /// still checked against this phone's replica.
    case offline
    /// The server could not suggest one right now.
    case unavailable

    /// Whether the suggest control can be pressed.
    internal var canSuggest: Bool {
        switch self {
        case .suggesting, .offline, .unavailable: false
        case .idle, .offered, .rejected, .edited: true
        }
    }

    /// The state after the person typed `value` over whatever was there.
    internal func typed(_ value: String, previous: String) -> InventoryCodeAssist {
        switch self {
        case .offered:
            return value.isEmpty ? .rejected : .edited(suggested: previous)
        case .edited(let suggested):
            return value == suggested ? .offered(alternatives: []) : self
        case .idle, .suggesting, .rejected, .offline, .unavailable:
            return self
        }
    }
}
