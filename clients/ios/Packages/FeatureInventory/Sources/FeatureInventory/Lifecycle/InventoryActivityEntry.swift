import AppCore

/// Something that happened to one item, in the ADR's verbs: one line in Item
/// detail's History section and on the History page, and the full account
/// its sheet opens into. Built from an `InventoryEvent` by
/// `InventoryActivityEntries`.
internal struct InventoryActivityEntry: Identifiable, Hashable {
    /// The event's `seq`, which is what Undo reverts.
    internal let seq: Int
    internal let verb: String
    internal let subject: String
    internal let detail: String
    internal let when: String
    internal let kind: InventoryHistoryKind
    internal let symbol: InventorySymbol
    /// The month heading the History page files the line under.
    internal let month: String
    internal let from: String?
    internal let to: String?
    internal let reason: InventoryDiscardReason?
    internal let device: String?
    /// Still the latest change to every field it touched, and not a destroy,
    /// so its account offers Undo.
    internal let isUndoable: Bool

    internal var id: Int { seq }

    /// What happened, as the one line says it.
    internal var title: String {
        let head = subject.isEmpty ? verb : "\(verb) \(subject)"
        return reason.map { "\(head) · \($0.label)" } ?? head
    }
}

/// Where an event's placement value said the item was or went.
///
/// `InventoryFieldValue` has no placement case, so a moved event carries its
/// placement as a `link` (or `text`) naming the location or container id, and
/// `hand` for in hand. Anything else reads as unknown rather than as an id.
internal enum InventoryEventPlacement: Equatable {
    case hand
    case named(String)
    case unknown

    internal static let handWire = "hand"

    internal init(_ value: InventoryFieldValue?, source: any InventoryQuerySource) {
        let id: String
        switch value {
        case .link(let raw), .text(let raw), .choice(let raw): id = raw
        default:
            self = .unknown
            return
        }
        if id == Self.handWire {
            self = .hand
        } else if let name = source.inventoryLocation(id: id)?.name
            ?? source.inventoryItem(id: id)?.name
        {
            self = .named(name)
        } else {
            self = .unknown
        }
    }

    /// The words the event sheet's From and To lines use.
    internal var words: String? {
        switch self {
        case .hand: "In hand"
        case .named(let name): name
        case .unknown: nil
        }
    }
}
