/// Everything the result screen draws for one ``AppCore/ReceiptOutcome`` case.
///
/// One type per case rather than a single struct with optional fields in
/// every direction: the three outcomes carry genuinely different shapes —
/// `created` a reference, `needsReview` an extracted receipt and a list of
/// complaints, `unreadable` a reason — and folding them into one struct would
/// mean every reader has to know which fields go together. Projecting into
/// one value (this enum) rather than switching on ``AppCore/ReceiptOutcome``
/// straight from the view is what makes what the screen says a value a test
/// compares, instead of a view hierarchy it has to walk.
internal enum ReceiptResultContent: Hashable, Sendable {
    case created(CreatedContent)
    case needsReview(NeedsReviewContent)
    case unreadable(UnreadableContent)

    /// One labelled line, shared by the cases that draw a table under their
    /// heading.
    internal struct Field: Hashable, Sendable, Identifiable {
        internal let id: String
        internal let label: String
        internal let value: String

        /// `id` defaults to `label`, matching `TransactionDetailContent`'s
        /// field: on the extracted-receipt table a label appears at most
        /// once, so the label identifies the line with nothing extra to
        /// carry. The gate-failure table is the exception — two failures can
        /// share a kind, and therefore a label — so it supplies its own `id`
        /// rather than let two rows collide under `ForEach`.
        internal init(id: String? = nil, label: String, value: String) {
            self.id = id ?? label
            self.label = label
            self.value = value
        }

        /// How VoiceOver reads it. Drawn as two lines and read as one
        /// utterance: a bare value announced apart from its label is two
        /// fragments the listener has to pair up themselves.
        internal var accessibilityLabel: String { "\(label), \(value)" }
    }

    internal struct CreatedContent: Hashable, Sendable {
        internal let heading: String
        internal let message: String
        internal let reference: String
        /// There is nowhere in the app yet to view the purchase this
        /// reference points at. Said outright rather than left for the
        /// reader to discover by tapping a reference that goes nowhere.
        internal let noDestinationNote: String
        internal var accessibilityLabel: String {
            "\(heading). \(message) \(reference) \(noDestinationNote)"
        }
    }

    internal struct NeedsReviewContent: Hashable, Sendable {
        internal let heading: String
        internal let message: String
        internal let photoCount: String?
        internal let extractedFields: [Field]
        /// One line per complaint the gate raised, already worded for a
        /// reader — never the raw ``AppCore/ReceiptGateFailureKind`` case.
        internal let failureLines: [Field]
        internal var accessibilityLabel: String { "\(heading). \(message)" }
    }

    internal struct UnreadableContent: Hashable, Sendable {
        internal let heading: String
        internal let message: String
        internal let reason: String
        internal let photoCount: String?
        internal var accessibilityLabel: String { "\(heading). \(message) \(reason)" }
    }
}
