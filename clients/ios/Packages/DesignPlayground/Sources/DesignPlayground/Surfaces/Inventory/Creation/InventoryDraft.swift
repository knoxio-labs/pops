import Foundation

/// Everything entered before the record exists.
///
/// The record is created at the final action and not before, so this is what
/// the phone is holding in the meantime: every value, every photograph's
/// bytes, and an internal id minted when the draft opened. The id is here
/// rather than assigned on create because a duplicate has to be a different
/// thing from its source from the first keystroke, and because the photographs
/// staged against it need something to belong to.
internal struct InventoryDraft: Equatable {
    /// Minted with the draft and never edited, never shown beside a field.
    /// Reachable only under Technical details, where it exists so a support
    /// question has an answer.
    internal let internalID: String
    /// The item this draft was copied from, when it was one.
    internal let copiedFrom: String?
    internal var name: String
    /// Chosen from the types the build ships. Nil is allowed and is the path
    /// POPS-4016 designs; nothing here forces one.
    internal var typeName: String?
    /// What this item records for the fields its type declares. Empty until a
    /// type is chosen, because until then there are no fields to answer.
    internal var values: [InventoryProperty]
    /// Anything the type did not ask for (ADR-001).
    internal var note: String
    internal var code: InventoryCodeEntry
    internal var identifiers: [InventoryExternalIdentifier]
    internal var photos: [InventoryDraftPhoto]
    internal var quantity: Int
    internal var placement: InventoryPlacementChoice
    /// A purchase or a document this item came from. Offered, never asked for:
    /// most of a move is catalogued years after the receipt went missing.
    internal var provenance: String?

    internal init(
        internalID: String,
        copiedFrom: String? = nil,
        name: String = "",
        typeName: String? = nil,
        values: [InventoryProperty] = [],
        note: String = "",
        code: InventoryCodeEntry = InventoryCodeEntry(),
        identifiers: [InventoryExternalIdentifier] = [],
        photos: [InventoryDraftPhoto] = [],
        quantity: Int = 1,
        placement: InventoryPlacementChoice = .inHand,
        provenance: String? = nil
    ) {
        self.internalID = internalID
        self.copiedFrom = copiedFrom
        self.name = name
        self.typeName = typeName
        self.values = values
        self.note = note
        self.code = code
        self.identifiers = identifiers
        self.photos = photos
        self.quantity = quantity
        self.placement = placement
        self.provenance = provenance
    }

    /// A record standing for more than one identical thing in one placement
    /// (ADR-001). Below that the count is not a field, it is the default.
    internal var isGrouped: Bool { quantity > 1 }

    /// Whether cancelling would throw anything away. A name typed and nothing
    /// else still counts.
    internal var hasStagedWork: Bool {
        isNamed || code.isLabelled || !photos.isEmpty
            || !identifiers.isEmpty || !note.isEmpty || typeName != nil || isGrouped
            || !values.isEmpty || provenance != nil
    }

    internal var issues: [InventoryDraftIssue] {
        var issues: [InventoryDraftIssue] = []
        if !isNamed { issues.append(.nameMissing) }
        if case .collision(let existing) = code.assist { issues.append(.codeTaken(existing)) }
        issues += identifiers.filter { !$0.isComplete }.map {
            .identifierIncomplete(label: $0.label)
        }
        if quantity < 1 { issues.append(.quantityBelowOne) }
        if !placement.isResolved { issues.append(.placementUnanswered) }
        return issues
    }

    internal var canCreate: Bool { issues.isEmpty }

    internal var isNamed: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty
    }
}

/// What stands between a draft and a record.
///
/// Only name is intrinsically required; everything else here is a value that
/// was started and left half-said, which is a different complaint and is
/// worded as one.
internal enum InventoryDraftIssue: Equatable, Identifiable {
    case nameMissing
    case codeTaken(String)
    case identifierIncomplete(label: String)
    case quantityBelowOne
    case placementUnanswered

    internal var id: String { message }

    internal var message: String {
        switch self {
        case .nameMissing: "Name is required"
        case .codeTaken(let existing): "Code already used by \(existing)"
        case .identifierIncomplete(let label): "\(label) is empty"
        case .quantityBelowOne: "Quantity must be at least 1"
        case .placementUnanswered: "Destination is required"
        }
    }
}

extension InventoryDraft {
    /// A draft copied from an item already in the catalogue.
    ///
    /// Everything that describes the thing is carried; the two things that
    /// identify this one are not. The internal id is new because it is a
    /// second thing, and the inventory code is cleared because a code is a
    /// sticker on one object and two objects cannot wear it.
    internal static func duplicating(
        _ item: InventoryFoundationItem, internalID: String
    ) -> InventoryDraft {
        InventoryDraft(
            internalID: internalID,
            copiedFrom: item.id,
            name: item.name,
            typeName: item.typeName,
            code: InventoryCodeEntry(),
            quantity: item.quantity.count,
            placement: InventoryPlacementChoice(item.placement))
    }

    /// An existing item opened for editing. Its internal id is its own, and a
    /// code it already carries comes with it.
    internal static func editing(_ item: InventoryFoundationItem) -> InventoryDraft {
        InventoryDraft(
            internalID: item.id,
            name: item.name,
            typeName: item.typeName,
            code: InventoryCodeEntry(value: item.code ?? ""),
            quantity: item.quantity.count,
            placement: InventoryPlacementChoice(item.placement))
    }
}
