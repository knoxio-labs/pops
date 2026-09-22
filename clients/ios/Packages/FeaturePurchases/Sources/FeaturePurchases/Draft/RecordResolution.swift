/// Which record a field points at, and how it came to.
///
/// Its own file because ``ReceiptDraft`` was over the length limit and this is
/// the part of it that is about provenance rather than about a form.
/// One type for the merchant and the address because they are the same shape
/// and change for the same reason: contacts owns entities, an entity owns a
/// list of addresses, and both fields on this form are "which of those is
/// this" rather than "what does it say". Two near-identical enums would drift
/// the moment one of them learned something.
///
/// **Neither is ever a string somebody typed.** The operative field in
/// `purchases` is `merchantEntityId`, and a name with no id behind it is a
/// purchase nothing can be reconciled or totalled against — which is how two
/// of the five purchases in production ended up attributed to nobody. A
/// record the receipt names and nothing recognises is not a record typed, it
/// is one ``unresolved``, and resolving it means choosing or creating.
///
/// The receipt's own wording survives separately, as provenance. It is what a
/// later match is attempted against; it is not the answer.
internal enum RecordResolution: Hashable, Sendable {
    /// The server matched it at ingest. A proposal: nobody has looked yet.
    case matched(id: String)
    /// A person picked it from the list. Asserted.
    case chosen(id: String)
    /// A person is creating one. No id until the save mints it, which is why
    /// this carries a value rather than an id — and why it is a distinct case
    /// rather than a `chosen` with a blank id.
    case created(value: String)
    /// Nothing is attached yet. Where a reading lands when the server matched
    /// nothing. A purchase may not be saved with an unresolved *merchant*; an
    /// unresolved address is ordinary, because an address is descriptive and a
    /// merchant is what everything else keys on.
    case unresolved

    /// The operative id, when one exists. A merchant being created has none
    /// yet, and that absence is the difference between "will be attributed"
    /// and "is attributed".
    internal var entityID: String? {
        switch self {
        case .matched(let id), .chosen(let id): id
        case .created, .unresolved: nil
        }
    }

    /// Whether a person has settled it. What decides between the proposal
    /// mark and the confirmed one.
    internal var isConfirmed: Bool {
        switch self {
        case .chosen, .created: true
        case .matched, .unresolved: false
        }
    }

    /// Whether there is a merchant at all. The save gate.
    internal var isResolved: Bool {
        switch self {
        case .matched, .chosen, .created: true
        case .unresolved: false
        }
    }

    /// What to show, when this case carries it. A chosen or matched record's
    /// name lives with the record, not here.
    internal var createdValue: String? {
        switch self {
        case .created(let value): value
        case .matched, .chosen, .unresolved: nil
        }
    }
}
