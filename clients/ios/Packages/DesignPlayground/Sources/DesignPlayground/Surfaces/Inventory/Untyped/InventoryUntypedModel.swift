/// An item filed before any type covered it, and a type as the phone meets it.
///
/// ADR-001 settled what an untyped item can hold: a name, a photo, a
/// placement, a note, an optional inventory code and a quantity. Nothing
/// structured, because structure is what a type declares. So the only thing
/// this adds to ``InventoryFoundationItem`` is the prose and the two facts
/// about waiting.

/// One item with no type, as the untyped path needs it.
internal struct InventoryUntypedItem: Identifiable, Equatable {
    internal let item: InventoryFoundationItem
    /// Everything the person knew and no type asked for.
    internal let note: String
    /// Set when the person said nothing will ever share this shape. It leaves
    /// the queue without gaining a type, which is the only way out that is not
    /// a deploy.
    internal let isKeptUntyped: Bool
    /// How long it has been waiting, as a person would say it.
    internal let filed: String

    internal init(
        item: InventoryFoundationItem,
        note: String = "",
        isKeptUntyped: Bool = false,
        filed: String
    ) {
        self.item = item
        self.note = note
        self.isKeptUntyped = isKeptUntyped
        self.filed = filed
    }

    internal var id: String { item.id }

    /// Whether the queue counts it. A typed item has left, a discarded one
    /// stopped counting, and one kept untyped on purpose was answered.
    internal var isWaiting: Bool {
        item.typeName == nil && item.lifecycle == .active && !isKeptUntyped
    }
}

/// A type as the phone sees it: a name, the fields it declares, and the words
/// that say an item is one of these.
///
/// It has no editor, and that absence is the decision rather than an omission.
/// Types are code and arrive with an update (ADR-001), so the phone's whole
/// job is to notice what a new one now covers.
internal struct InventoryItemType: Identifiable, Equatable {
    internal let id: String
    internal let name: String
    /// In the order the type declares them, which is the order an item answers
    /// them in.
    internal let fieldNames: [String]
    /// The words that say an item is one of these. Single words, matched whole:
    /// a term is compared against the words of a name and a note, so "table"
    /// never claims a tablecloth.
    internal let terms: [String]

    /// The version that brought it, so a screen can say where a type came from
    /// without implying anyone here made it.
    internal let arrivedIn: String
}

/// A field a type gained after items were already on it.
///
/// Separate from ``InventoryItemType`` because the question it raises is a
/// different one: not "what does this type cover" but "what does an item
/// already on it do about a question nobody has been asked yet".
internal struct InventoryTypeChange: Equatable {
    internal let type: InventoryItemType
    internal let addedField: String
    internal let itemsAffected: Int
    internal let arrivedIn: String
}
