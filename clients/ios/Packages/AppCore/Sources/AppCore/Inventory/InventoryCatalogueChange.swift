/// What part of the catalogue an ``InventoryCatalogueChange`` is about.
/// Open on the wire, like ``InventoryRejectedReason``, so a definition kind
/// this build has never heard of is kept rather than refused.
public enum InventoryCatalogueDefinition: Hashable, Sendable {
    case type
    case field
    case option
    /// A whole catalogue revision: one the server does not hold, or one that
    /// raised the protocol floor.
    case revision
    case unrecognised(String)

    public init(wire: String) {
        switch wire {
        case "type": self = .type
        case "field": self = .field
        case "option": self = .option
        case "revision": self = .revision
        default: self = .unrecognised(wire)
        }
    }

    /// The wire spelling, so an `.unrecognised` kind round-trips as it
    /// arrived.
    public var wireValue: String {
        switch self {
        case .type: "type"
        case .field: "field"
        case .option: "option"
        case .revision: "revision"
        case .unrecognised(let value): value
        }
    }
}

/// What happened to a definition after a change was authored against it.
public enum InventoryCatalogueChangeKind: Hashable, Sendable {
    case archived
    /// Archived in favour of another definition, named by
    /// ``InventoryCatalogueChange/replacementId``.
    case replaced
    /// An enum option taken out of use.
    case retired
    case nowRequired
    /// Not declared by the revision the change was judged against.
    case notInRevision
    /// Still there, but its definition changed in a way the change cannot
    /// be moved across (a computed expression, the type's capabilities).
    case redefined
    /// Only a newer app can read the revision.
    case needsNewerApp
    case unrecognised(String)

    public init(wire: String) {
        switch wire {
        case "archived": self = .archived
        case "replaced": self = .replaced
        case "retired": self = .retired
        case "now_required": self = .nowRequired
        case "not_in_revision": self = .notInRevision
        case "redefined": self = .redefined
        case "needs_newer_app": self = .needsNewerApp
        default: self = .unrecognised(wire)
        }
    }

    /// The wire spelling, so an `.unrecognised` kind round-trips as it
    /// arrived.
    public var wireValue: String {
        switch self {
        case .archived: "archived"
        case .replaced: "replaced"
        case .retired: "retired"
        case .nowRequired: "now_required"
        case .notInRevision: "not_in_revision"
        case .redefined: "redefined"
        case .needsNewerApp: "needs_newer_app"
        case .unrecognised(let value): value
        }
    }
}

/// One definition standing in the way of a queued change: what the server
/// names on a `catalogue_update_required` or `catalogue_repair_required`
/// refusal, or what the replica finds when it moves a held change onto a
/// newer catalogue itself.
public struct InventoryCatalogueChange: Hashable, Sendable {
    public let definition: InventoryCatalogueDefinition
    /// The definition's stable id, or the revision number for a `revision`.
    public let id: String
    /// The type a field or option belongs to, and a type's own id.
    public let typeId: String?
    /// The field an option belongs to, and a field's own id.
    public let fieldId: String?
    public let change: InventoryCatalogueChangeKind
    /// The definition that took this one's place, when one is recorded.
    public let replacementId: String?
    /// The published revision the change first appeared in.
    public let revision: Int

    public init(
        definition: InventoryCatalogueDefinition, id: String, typeId: String? = nil,
        fieldId: String? = nil, change: InventoryCatalogueChangeKind,
        replacementId: String? = nil, revision: Int
    ) {
        self.definition = definition
        self.id = id
        self.typeId = typeId
        self.fieldId = fieldId
        self.change = change
        self.replacementId = replacementId
        self.revision = revision
    }
}
