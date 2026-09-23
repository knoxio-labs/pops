/// A patch to one optional field: left alone, set to a value, or cleared.
/// Plain `Value?` cannot say "leave it" and "clear it" at once, which
/// `item.edit`'s `note` needs (ADR-002's wire contract: only the keys present
/// in a patch are touched).
public enum InventoryFieldUpdate<Value: Hashable & Sendable>: Hashable, Sendable {
    case unchanged
    case set(Value)
    case cleared
}

/// The verb a move records, per ADR-002's wire contract (`item.move`). Purely
/// descriptive: the resulting `InventoryPlacement` is what a query and a
/// conflict act on, and the verb only shapes how history reads it back.
public enum InventoryMoveVerb: Hashable, Sendable {
    case move
    case pickUp
    case putBack
    case store

    /// The wire spelling `item.move`'s `verb` argument takes.
    public var wireValue: String {
        switch self {
        case .move: "move"
        case .pickUp: "pick_up"
        case .putBack: "put_back"
        case .store: "store"
        }
    }
}

/// What a newly created item needs. `id` is minted by the caller (a UUIDv4,
/// per ADR-002 D6): an offline create therefore has its final identity from
/// the first keystroke, with no id ever remapped once the server has taken
/// it.
public struct InventoryNewItem: Hashable, Sendable {
    public let id: String
    public let name: String
    public let typeKey: String?
    public let fields: [String: InventoryFieldValue]
    public let note: String?
    /// Identifiers someone else assigned (a serial, a model number), carried
    /// by `item.create`'s `Item` on the wire. Never the inventory code, which
    /// is set by its own dependent `setItemCode`.
    public let externalIds: [InventoryExternalIdentifier]
    public let quantity: Int
    public let placement: InventoryPlacement

    public init(
        id: String,
        name: String,
        typeKey: String?,
        fields: [String: InventoryFieldValue] = [:],
        note: String? = nil,
        externalIds: [InventoryExternalIdentifier] = [],
        quantity: Int = 1,
        placement: InventoryPlacement
    ) {
        self.id = id
        self.name = name
        self.typeKey = typeKey
        self.fields = fields
        self.note = note
        self.externalIds = externalIds
        self.quantity = quantity
        self.placement = placement
    }
}

/// A stored protocol-2 field value addressed by its immutable catalogue field ID.
public struct InventoryProtocol2FieldValue: Codable, Hashable, Sendable {
    public let fieldId: String
    public let values: [InventoryPrimitiveValue]

    public init(fieldId: String, values: [InventoryPrimitiveValue]) {
        self.fieldId = fieldId
        self.values = values
    }
}

/// A protocol-2 patch to a stable field ID. A `nil` value list clears the
/// field; a non-empty list replaces all of its values.
public struct InventoryProtocol2FieldPatch: Codable, Hashable, Sendable {
    public let fieldId: String
    public let values: [InventoryPrimitiveValue]?

    public init(fieldId: String, values: [InventoryPrimitiveValue]?) {
        self.fieldId = fieldId
        self.values = values
    }
}

/// What a new protocol-2 item needs. `catalogueRevision`, `typeId`, and every
/// field ID name immutable catalogue records, so queued writes remain bound to
/// exactly the schema the editor rendered.
public struct InventoryNewProtocol2Item: Hashable, Sendable {
    public let id: String
    public let name: String
    public let catalogueRevision: Int
    public let typeId: String
    public let values: [InventoryProtocol2FieldValue]
    public let note: String?
    public let externalIds: [InventoryExternalIdentifier]
    public let quantity: Int
    public let placement: InventoryPlacement

    public init(
        id: String, name: String, catalogueRevision: Int, typeId: String,
        values: [InventoryProtocol2FieldValue] = [], note: String? = nil,
        externalIds: [InventoryExternalIdentifier] = [], quantity: Int = 1,
        placement: InventoryPlacement
    ) {
        self.id = id
        self.name = name
        self.catalogueRevision = catalogueRevision
        self.typeId = typeId
        self.values = values
        self.note = note
        self.externalIds = externalIds
        self.quantity = quantity
        self.placement = placement
    }
}

/// What a newly created location needs. `id` is client-minted, the same as
/// `InventoryNewItem.id`.
public struct InventoryNewLocation: Hashable, Sendable {
    public let id: String
    public let name: String
    public let parentId: InventoryLocation.ID?
    public let sortOrder: Int

    public init(id: String, name: String, parentId: InventoryLocation.ID?, sortOrder: Int) {
        self.id = id
        self.name = name
        self.parentId = parentId
        self.sortOrder = sortOrder
    }
}

/// Every write ADR-002 D6 recognises. `InventoryStore.perform(_:)` is the only
/// way a view changes anything: revision tracking, dependency ordering and
/// idempotency keys are the store's job, not the caller's, so a command names
/// only what a person decided.
public enum InventoryCommand: Hashable, Sendable {
    case createItem(InventoryNewItem)
    case createProtocol2Item(InventoryNewProtocol2Item)
    /// `fields` patches by key: a key mapped to a value sets it, a key mapped
    /// to `nil` clears it, and an absent key is untouched. `externalIds`
    /// replaces the whole list when present and leaves it alone when `nil`,
    /// as `item.edit`'s optional `externalIds` does on the wire.
    case editItem(
        id: InventoryItem.ID, name: String?, note: InventoryFieldUpdate<String>,
        fields: [String: InventoryFieldValue?], externalIds: [InventoryExternalIdentifier]? = nil)
    case changeItemType(
        id: InventoryItem.ID, typeKey: String, fields: [String: InventoryFieldValue])
    case editProtocol2Item(
        id: InventoryItem.ID, catalogueRevision: Int, values: [InventoryProtocol2FieldPatch])
    case changeProtocol2ItemType(
        id: InventoryItem.ID, catalogueRevision: Int, typeId: String,
        values: [InventoryProtocol2FieldValue])
    case setItemCode(id: InventoryItem.ID, code: String?)
    case moveItem(id: InventoryItem.ID, to: InventoryPlacement, verb: InventoryMoveVerb)
    case setItemAccess(id: InventoryItem.ID, access: InventoryAccess)
    case setItemFull(id: InventoryItem.ID, isFull: Bool)
    case setItemLifecycle(
        id: InventoryItem.ID, lifecycle: InventoryLifecycle, reason: InventoryDiscardReason?)
    case setItemQuantity(id: InventoryItem.ID, quantity: Int)
    case splitItem(id: InventoryItem.ID, newItemId: InventoryItem.ID, quantity: Int)
    case attachPhoto(itemId: InventoryItem.ID, sha256: String, position: Int)
    case removePhoto(itemId: InventoryItem.ID, sha256: String)
    case reorderPhotos(itemId: InventoryItem.ID, sha256s: [String])
    case restoreDeletedItem(id: InventoryItem.ID)
    /// Tombstones an item (`item.delete`). A container is emptied first: its
    /// direct contents go in hand remembering it, since deletion never
    /// cascades.
    case deleteItem(id: InventoryItem.ID)
    case createLocation(InventoryNewLocation)
    case renameLocation(id: InventoryLocation.ID, name: String)
    case moveLocation(id: InventoryLocation.ID, parentId: InventoryLocation.ID?)
    case deleteLocation(id: InventoryLocation.ID)
    /// Undoes one event (`event.revert`). The server requires the mutation's
    /// entity to be the one the event is about, so the command names it:
    /// `entityKind` and `entityId` are the reverted event's own.
    case revertEvent(seq: Int, entityKind: InventoryEntityKind, entityId: String)

    /// The entity the command's outcome, receipt and any repair are filed
    /// under. A revert is filed under the entity of the event it undoes.
    public var entityId: String {
        switch self {
        case .createItem(let item): item.id
        case .createProtocol2Item(let item): item.id
        case .editItem(let id, _, _, _, _): id
        case .changeItemType(let id, _, _): id
        case .editProtocol2Item(let id, _, _): id
        case .changeProtocol2ItemType(let id, _, _, _): id
        case .setItemCode(let id, _): id
        case .moveItem(let id, _, _): id
        case .setItemAccess(let id, _): id
        case .setItemFull(let id, _): id
        case .setItemLifecycle(let id, _, _): id
        case .setItemQuantity(let id, _): id
        case .splitItem(let id, _, _): id
        case .attachPhoto(let id, _, _): id
        case .removePhoto(let id, _): id
        case .reorderPhotos(let id, _): id
        case .restoreDeletedItem(let id): id
        case .deleteItem(let id): id
        case .createLocation(let location): location.id
        case .renameLocation(let id, _): id
        case .moveLocation(let id, _): id
        case .deleteLocation(let id): id
        case .revertEvent(_, _, let entityId): entityId
        }
    }

    /// Which table ``entityId`` names.
    public var entityKind: InventoryEntityKind {
        switch self {
        case .createLocation, .renameLocation, .moveLocation, .deleteLocation: .location
        case .revertEvent(_, let entityKind, _): entityKind
        default: .item
        }
    }

    /// The immutable protocol-2 catalogue revision this command must be
    /// validated against. Protocol-1 commands have no catalogue revision.
    public var protocol2CatalogueRevision: Int? {
        switch self {
        case .createProtocol2Item(let item): item.catalogueRevision
        case .editProtocol2Item(_, let revision, _): revision
        case .changeProtocol2ItemType(_, let revision, _, _): revision
        default: nil
        }
    }
}
