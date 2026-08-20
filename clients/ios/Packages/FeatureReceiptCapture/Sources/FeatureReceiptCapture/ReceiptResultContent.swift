import DesignSystem

/// Everything the result screen draws for one ``AppCore/ReceiptOutcome`` case.
///
/// One type per case rather than a single struct with optional fields in
/// every direction: the three outcomes carry genuinely different shapes —
/// `created` a purchase, `needsReview` an extracted receipt and a list of
/// complaints, `unreadable` a reason — and folding them into one struct would
/// mean every reader has to know which fields go together. Projecting into
/// one value (this enum) rather than switching on ``AppCore/ReceiptOutcome``
/// straight from the view is what makes what the screen says a value a test
/// compares, instead of a view hierarchy it has to walk.
///
/// ## The shape mirrors a receipt, not a database row
///
/// Every case here used to be a heading plus a flat list of label-over-value
/// pairs, which is the shape of the record rather than the shape of the paper
/// the reader is holding. A reviewer's whole job is putting the two side by
/// side, and a discrepancy shows up when the two are laid out alike: who and
/// when at the top, the items in a column, the money that adjusts them, then
/// the total. So the groups below are the receipt's own, and the view draws
/// them in that order because the paper does.
internal enum ReceiptResultContent: Hashable, Sendable {
    case created(CreatedContent)
    case needsReview(NeedsReviewContent)
    case unreadable(UnreadableContent)

    /// Which of the three this is, before any of its words are read — the
    /// glyph and the colour the screen opens with.
    ///
    /// Held here rather than chosen in the view so "these are three different
    /// situations" is a value a test can assert, on every lane. The render
    /// comparison next to it can only make that claim where the colour
    /// catalogue compiled.
    internal var tone: PopsStatusHeader.Tone {
        switch self {
        case .created(let created): created.tone
        case .needsReview(let needsReview): needsReview.tone
        case .unreadable(let unreadable): unreadable.tone
        }
    }

    /// One labelled line, shared by the groups that draw a value against a
    /// name.
    internal struct Field: Hashable, Sendable, Identifiable {
        internal let id: String
        internal let label: String
        internal let value: String

        /// `id` defaults to `label`, matching `TransactionDetailContent`'s
        /// field: within any one group a label appears at most once, so the
        /// label identifies the line with nothing extra to carry. The
        /// gate-failure list is the exception — two failures can share a
        /// kind, and therefore a label — so it supplies its own `id` rather
        /// than let two rows collide under `ForEach`.
        internal init(id: String? = nil, label: String, value: String) {
            self.id = id ?? label
            self.label = label
            self.value = value
        }

        /// How VoiceOver reads it. Drawn as a name and a figure and read as
        /// one utterance: a bare value announced apart from its label is two
        /// fragments the listener has to pair up themselves.
        internal var accessibilityLabel: String { "\(label), \(value)" }
    }

    /// One line as the receipt printed it: what it was, what it cost, and
    /// whatever qualified the price.
    ///
    /// Its own type rather than a ``Field`` because the two are drawn
    /// differently and for different reasons — a field is a name and a value,
    /// a line item is a description that wraps against an amount that must
    /// stay in its column so a reader can run down it.
    internal struct LineItem: Hashable, Sendable, Identifiable {
        internal let id: String
        internal let description: String
        internal let amount: String
        /// `×2`, `$4.50/kg` — verbatim, and `nil` when the receipt qualified
        /// nothing. Never invented: a `×1` on a weighed line makes it look
        /// counted.
        internal let note: String?

        internal init(id: String, description: String, amount: String, note: String?) {
            self.id = id
            self.description = description
            self.amount = amount
            self.note = note
        }

        internal var accessibilityLabel: String {
            [description, note, amount].compactMap { $0 }.joined(separator: ", ")
        }
    }

    internal struct CreatedContent: Hashable, Sendable {
        /// It worked, and nothing here needs a person.
        internal let tone = PopsStatusHeader.Tone.success
        internal let heading: String
        internal let message: String
        /// As the purchases pillar resolved it, or `nil` when it could not.
        /// Left out rather than filled with a placeholder — the total and the
        /// count are still checkable, and an "Unknown merchant" line is a
        /// claim about the receipt that nobody made.
        internal let merchantName: String?
        /// The one figure this screen is about, drawn larger than anything
        /// else on it.
        internal let total: String
        /// `12 items`, or `nil` when the reading found no separate lines.
        internal let itemCount: String?
        /// The receipt's own date, when the purchase carries one.
        internal let purchasedOn: String?
        internal let reference: String
        /// The same three facts as one line — "Woolworths · 12 items ·
        /// $84.20". Not drawn: this is what VoiceOver reads, because the card
        /// above is one accessibility element and a reader hearing four
        /// fragments has to assemble the confirmation themselves.
        internal let summary: String

        internal var accessibilityLabel: String {
            [heading + ".", message, summary, purchasedOn, reference]
                .compactMap { $0 }
                .joined(separator: " ")
        }
    }

    /// Who and when, as printed at the top of the paper.
    ///
    /// Three named members rather than a `[Field]`, because the screen draws
    /// them at three different weights and has to know which is which: the
    /// merchant is what a reader recognises the receipt by, the address and
    /// the date place it. A list of interchangeable pairs is exactly the
    /// flatness this replaced.
    internal struct Identity: Hashable, Sendable {
        internal let merchant: Field?
        internal let address: Field?
        internal let date: Field?

        internal init(merchant: Field?, address: Field?, date: Field?) {
            self.merchant = merchant
            self.address = address
            self.date = date
        }

        /// In printed order, dropping whatever the receipt did not state.
        internal var fields: [Field] { [merchant, address, date].compactMap { $0 } }

        internal var isEmpty: Bool { fields.isEmpty }
    }

    internal struct NeedsReviewContent: Hashable, Sendable {
        /// Not a failure: the receipt was read, and what it says needs
        /// settling by somebody. Drawing it in the failure colour would tell
        /// a reader their purchase is gone when it is waiting for them.
        internal let tone = PopsStatusHeader.Tone.warning
        internal let heading: String
        internal let message: String
        internal let photoCount: String?
        /// Who and when, as printed at the top of the paper.
        internal let identity: Identity
        /// The items, in the order they were printed.
        internal let lines: [LineItem]
        /// The figure everything else is checked against. `nil` only when the
        /// receipt stated none, which is itself one of the things the gate
        /// refuses on.
        internal let total: Field?
        /// Tax, discounts, surcharges, shipping — what moves the lines to the
        /// total.
        internal let adjustments: [Field]
        /// Where the model could not read the paper, so a reviewer can tell
        /// "the reading is wrong" from "the receipt is damaged".
        internal let notes: Field?
        /// One line per complaint the gate raised, already worded for a
        /// reader — never the raw ``AppCore/ReceiptGateFailureKind`` case.
        internal let failureLines: [Field]

        /// Every field of the reading, in the order the receipt prints them.
        ///
        /// Derived rather than stored, and kept because "a field the receipt
        /// never stated is dropped, and the rest stay in receipt order" is
        /// one claim about the whole reading — asserting it group by group
        /// would let two groups each be right while the order between them
        /// went wrong.
        internal var orderedFields: [Field] {
            identity.fields + [total].compactMap { $0 } + adjustments + [notes].compactMap { $0 }
        }

        internal var accessibilityLabel: String { "\(heading). \(message)" }
    }

    internal struct UnreadableContent: Hashable, Sendable {
        /// Nothing came back. The one outcome that is a failure.
        internal let tone = PopsStatusHeader.Tone.danger
        internal let heading: String
        internal let message: String
        internal let reason: String
        internal let photoCount: String?
        internal var accessibilityLabel: String { "\(heading). \(message) \(reason)" }
    }
}
