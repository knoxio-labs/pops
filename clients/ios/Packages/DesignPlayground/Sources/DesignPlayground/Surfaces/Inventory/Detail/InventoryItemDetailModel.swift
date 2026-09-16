/// What the item detail page knows beyond the row (POPS-3980).
///
/// Built on ``InventoryFoundationItem`` rather than instead of it: the row,
/// the action sheet and this page all describe one item, in ADR-001's words,
/// and only what this page adds beyond the row lives here.

/// One identifier someone else assigned. ADR-001: not "code" unqualified,
/// which is POPS's own inventory code and lives on the item itself.
internal struct InventoryExternalIdentifier: Identifiable, Equatable {
    internal let kind: String
    internal let value: String

    internal var id: String { "\(kind)-\(value)" }
}

/// A field the item's type declares, and what this item recorded for it. Not
/// set is a value, not an absence, the decided presentation ADR-001 and
/// ``InventoryTemplateVariantView`` settled on.
internal struct InventoryDetailField: Identifiable, Equatable {
    internal let key: String
    internal let value: String

    internal var id: String { key }

    internal static let notSet = "Not set"
}

/// A photograph as the gallery holds it, or the reason it cannot show one.
///
/// Bytes are not modelled here: the playground never fetches (see
/// ``Catalog``), so a photo here is what a person would see, not the JPEG
/// behind it.
internal struct InventoryPhoto: Identifiable, Equatable {
    internal let caption: String
    internal let isBroken: Bool

    internal var id: String { caption }
}

/// Where an item was bought, what it cost, and what proves it.
internal struct InventoryProvenance: Equatable {
    internal let merchant: String
    internal let price: String
    internal let purchasedOn: String
    internal let hasReceipt: Bool
    internal let warranty: String?
}

/// Whether the pillar's document store answered, and what it holds for this
/// item if it did. Missing Paperless is a state of the store, not of the
/// item, which is why an item can have documents and still show this as
/// unavailable, POPS knows they exist and cannot fetch them right now.
internal enum InventoryDocuments: Equatable {
    case linked([String])
    case none
    case paperlessUnavailable
}

/// What a container-capable item's contents look like from its own page.
/// Its own contents are a list on the container's own screen; this is only
/// the summary ADR-001's "container capability summary" asks for.
internal struct InventoryContainerSummary: Equatable {
    internal let itemCount: Int
    internal let containerCount: Int
}

/// A change the server disagreed with. Reuses ``InventoryRepairRow``'s words
/// rather than inventing a second "something went wrong" vocabulary.
internal struct InventoryConflict: Equatable {
    internal let problem: String
    internal let resolution: String
}

/// Everything the item detail page can show about one item.
internal struct InventoryItemDetail: Identifiable {
    internal let item: InventoryFoundationItem
    internal let photos: [InventoryPhoto]
    internal let externalIdentifiers: [InventoryExternalIdentifier]
    internal let description: String?
    internal let fields: [InventoryDetailField]
    internal let capabilities: [String]
    /// One step back, not a history, per ADR-001. Separate from
    /// ``InventoryPlacement/inHand(previous:)``'s own `previous`, which only
    /// covers the in-hand case: a direct or contained item can have moved too.
    internal let previousPlacement: String?
    internal let containerSummary: InventoryContainerSummary?
    internal let provenance: InventoryProvenance?
    internal let documents: InventoryDocuments
    internal let activity: [InventoryActivityEntry]
    internal let conflict: InventoryConflict?

    internal var id: String { item.id }
}

/// Something that happened to this item, in the ADR's verbs.
internal struct InventoryActivityEntry: Identifiable, Equatable {
    internal let id: String
    internal let verb: String
    internal let subject: String
    internal let detail: String
    internal let when: String
}
