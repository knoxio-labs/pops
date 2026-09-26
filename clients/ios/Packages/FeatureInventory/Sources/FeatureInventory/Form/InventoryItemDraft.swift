import AppCore
import Foundation

/// Everything entered before the record exists, or before an edit is saved.
///
/// `id` is minted when a create opens (clients mint item ids), so the
/// record has its final identity from the first keystroke and the code check
/// can tell this item from every other.
internal struct InventoryItemDraft: Hashable, Sendable {
    internal let id: InventoryItem.ID
    internal var name: String
    /// Nil is a real answer, "No type yet" (POPS-4016).
    internal var typeKey: String?
    /// Entries by field key. Kept across a type change, so switching back
    /// finds what was typed; only the chosen type's keys are ever stored.
    internal var fields: [String: InventoryFieldEntry]
    /// Keys a person changed. An edit patches only these, so a stored value
    /// the form cannot represent (a choice the type no longer declares) is
    /// left alone rather than cleared by an unrelated save.
    internal var touchedFields: Set<String>
    internal var note: String
    internal var code: InventoryCodeEntry
    internal var identifiers: [InventoryIdentifierDraft]
    /// The trailing "Serial / model" row, before its plus is pressed.
    internal var pendingIdentifier: String
    internal var quantity: Int
    internal var placement: InventoryPlacement
    /// What the destination row names; nil for in hand.
    internal var placementName: String?
    internal var photos: [InventoryFormPhoto]

    internal static let quantityRange = 1...999

    internal init(
        id: InventoryItem.ID, placement: InventoryPlacement = .hand, placementName: String? = nil
    ) {
        self.id = id
        name = ""
        typeKey = nil
        fields = [:]
        touchedFields = []
        note = ""
        code = InventoryCodeEntry()
        identifiers = []
        pendingIdentifier = ""
        quantity = 1
        self.placement = placement
        self.placementName = placementName
        photos = []
    }

    /// An existing item opened for editing. Its code comes with it.
    internal init(editing item: InventoryItem, placementName: String?) {
        self.init(id: item.id, placement: item.placement, placementName: placementName)
        name = item.name
        typeKey = item.typeKey
        fields = item.fields.compactMapValues(InventoryFieldEntry.init)
        note = item.note ?? ""
        code = InventoryCodeEntry(value: item.code ?? "")
        identifiers = item.externalIds.map(InventoryIdentifierDraft.init)
        quantity = item.quantity.count
        photos = item.photos.map(InventoryFormPhoto.init)
    }

    internal var isNamed: Bool { !trimmedName.isEmpty }

    internal var trimmedName: String { name.trimmingCharacters(in: .whitespaces) }

    /// The entry a field row edits: what was typed, or the field's blank.
    internal func entry(
        for field: InventoryFieldDefinition, units: [InventoryUnit]
    ) -> InventoryFieldEntry {
        fields[field.key] ?? .blank(for: field, units: units)
    }

    internal mutating func set(_ entry: InventoryFieldEntry, for field: InventoryFieldDefinition) {
        if case .choice(let chosen?) = entry,
            !InventoryFormChoices.options(for: field).contains(chosen)
        {
            return
        }
        fields[field.key] = entry
        touchedFields.insert(field.key)
    }

    /// Whether cancelling would throw anything away.
    internal var hasStagedWork: Bool {
        isNamed || code.normalized != nil || !identifiers.isEmpty || !pendingIdentifier.isEmpty
            || !note.isEmpty || typeKey != nil || quantity > 1 || !touchedFields.isEmpty
            || photos.contains { $0.upload != .attached }
    }

    /// Every identifier that will be stored, including one typed into the
    /// trailing row whose plus was never pressed: typed text is not lost.
    internal var externalIds: [InventoryExternalIdentifier] {
        var all = identifiers
        if !pendingIdentifier.trimmingCharacters(in: .whitespaces).isEmpty {
            all.append(InventoryIdentifierDraft(kind: .serial, value: pendingIdentifier))
        }
        return all.compactMap(\.stored)
    }

    /// Moves the trailing row's text into a row of its own.
    internal mutating func commitPendingIdentifier() {
        guard !pendingIdentifier.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        identifiers.append(InventoryIdentifierDraft(kind: .serial, value: pendingIdentifier))
        pendingIdentifier = ""
    }
}

/// What stands between a draft and a record. Only a name is intrinsically
/// required; everything else is a value started and left half-said, worded
/// as that rather than as a missing answer.
internal enum InventoryDraftIssue: Hashable, Sendable, Error {
    case nameMissing
    case codeTaken(heldBy: String)
    case identifierIncomplete(label: String)
    case identifierInvalid(label: String)
    case fieldMissing(label: String)
    case notANumber(label: String)
    case rangeReversed(label: String)

    internal var message: String {
        switch self {
        case .nameMissing: "Name is required"
        case .codeTaken(let holder): "Code already used by \(holder)"
        case .identifierIncomplete(let label): "\(label) is empty"
        case .identifierInvalid(let label): "\(label) is not valid"
        case .fieldMissing(let label): "\(label) is required"
        case .notANumber(let label): "\(label) needs a number"
        case .rangeReversed(let label): "\(label) starts above where it ends"
        }
    }
}

/// An identifier somebody else assigned, and what they call it. A pair rather
/// than a string, because "SN-4471" alone is a number nobody can look up.
internal struct InventoryIdentifierDraft: Identifiable, Hashable, Sendable {
    /// The kinds the picker offers, a closed list so two people recording
    /// the same fact write the same word. `rawValue` is the wire `kind`.
    internal enum Kind: String, CaseIterable, Hashable, Sendable {
        case serial
        case model
        case barcode
        case licence
        case isbn

        internal var label: String {
            if self == .isbn { return "ISBN" }
            return rawValue.prefix(1).uppercased() + rawValue.dropFirst()
        }
    }

    internal let id: UUID
    internal var kind: String
    internal var value: String

    internal init(kind: Kind, value: String) {
        id = UUID()
        self.kind = kind.rawValue
        self.value = value
    }

    internal init(_ stored: InventoryExternalIdentifier) {
        id = UUID()
        kind = stored.kind
        value = stored.value
    }

    /// The label a row shows: the known kind's word, or the stored kind as
    /// it came when this build does not know it.
    internal var label: String { InventoryIdentifierKindLabel.label(for: kind) }

    internal var isComplete: Bool { !value.trimmingCharacters(in: .whitespaces).isEmpty }

    internal var stored: InventoryExternalIdentifier? {
        let trimmed = value.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return nil }
        if kind == Kind.isbn.rawValue {
            guard let normalised = InventoryISBN.normalised(trimmed) else { return nil }
            return InventoryExternalIdentifier(kind: kind, value: normalised)
        }
        return InventoryExternalIdentifier(kind: kind, value: trimmed)
    }
}
