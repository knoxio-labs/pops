/// What the trailing edge of a search section header displays.
public enum SearchSectionHeaderTrailing: Equatable, Sendable {
    /// Nothing appears after the title.
    case none
    /// A settled result count appears after the title.
    case count(Int)
    /// A control opens all results and communicates the server total.
    case showAll(Int)
    /// A placeholder communicates that refinement is still underway.
    case pending

    /// Chooses the trailing treatment from a result section's shape.
    public init(shown: Int, total: Int, isRefining: Bool, isScoped: Bool) {
        if isScoped {
            self = isRefining ? .none : .count(total)
        } else if isRefining {
            self = .pending
        } else if total > shown {
            self = .showAll(total)
        } else {
            self = .count(total)
        }
    }
}
