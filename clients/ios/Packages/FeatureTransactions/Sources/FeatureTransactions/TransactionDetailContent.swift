/// Everything the detail screen draws, whichever shape it was built from — the
/// row the list already held, or the fuller record the BFM sent back.
///
/// Projecting both into one value is what makes "opens seeded, then fills in"
/// one screen that grows lines rather than two screens somebody has to keep
/// looking alike. It also makes what the screen says a value a test compares,
/// instead of a view hierarchy it has to walk.
internal struct TransactionDetailContent: Hashable, Sendable {
    /// One labelled line.
    internal struct Field: Hashable, Sendable, Identifiable {
        internal let label: String
        internal let value: String

        /// A label appears at most once on this screen, so it identifies the
        /// line. `ForEach` needs something, and an index would re-identify
        /// every row below one that filled in.
        internal var id: String { label }

        /// How VoiceOver reads it. Drawn as two lines and read as one
        /// utterance: a bare value announced apart from its label is two
        /// fragments the listener has to pair up themselves.
        internal var accessibilityLabel: String { "\(label), \(value)" }
    }

    internal let title: String
    internal let amount: String
    internal let date: String
    /// Whether the amount is money arriving, which is the only thing this app
    /// colours. Read off the amount the server sent and nothing else.
    internal let isCredit: Bool
    internal let fields: [Field]

    /// The heading as one sentence, for the same reason a list row has one:
    /// VoiceOver reads an element as a single utterance, and three fragments do
    /// not parse as anything.
    internal var accessibilityLabel: String {
        [title, amount, date].joined(separator: ", ")
    }
}
