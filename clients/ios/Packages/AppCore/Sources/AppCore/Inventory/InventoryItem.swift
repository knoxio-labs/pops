import Foundation

/// One identifier someone else assigned. ADR-001: not "code" unqualified,
/// which is POPS's own inventory code and lives on `InventoryItem.code`.
public struct InventoryExternalIdentifier: Identifiable, Hashable, Sendable {
    public let kind: String
    public let value: String

    public init(kind: String, value: String) {
        self.kind = kind
        self.value = value
    }

    public var id: String { "\(kind)-\(value)" }
}

/// A photo attached to an item, by content hash (ADR-002 D9): the bytes live
/// under the images volume, addressed by `sha256`, and this is only the
/// reference plus the caption a person typed.
public struct InventoryPhotoReference: Identifiable, Hashable, Sendable {
    public let sha256: String
    public let caption: String?

    public init(sha256: String, caption: String?) {
        self.sha256 = sha256
        self.caption = caption
    }

    public var id: String { sha256 }
}

/// Where an item was bought, what it cost, and what proves it. Every field is
/// optional because most items carry none of this (ADR-001).
public struct InventoryProvenance: Hashable, Sendable {
    public let merchant: String?
    public let price: MoneyAmount?
    public let purchasedOn: Date?
    public let warrantyExpires: Date?
    /// A soft URI (`pops://purchases/...`) back to the purchase that bought
    /// this item, when one links it.
    public let transactionUri: String?

    public init(
        merchant: String?,
        price: MoneyAmount?,
        purchasedOn: Date?,
        warrantyExpires: Date?,
        transactionUri: String?
    ) {
        self.merchant = merchant
        self.price = price
        self.purchasedOn = purchasedOn
        self.warrantyExpires = warrantyExpires
        self.transactionUri = transactionUri
    }
}

/// Whether the Paperless document store answered, and what it holds for this
/// item if it did. `unavailable` is a state of the store, not of the item: an
/// item can have documents and still show this as unavailable because POPS
/// knows they exist and cannot fetch them right now. Recomputed on every
/// refresh rather than cached as truth (ADR-002, wire contract section).
public enum InventoryDocumentsStatus: Hashable, Sendable {
    case linked([String])
    case none
    case unavailable
}

/// A container's own state: whether it takes more items, and whether a
/// person has marked it full. Present exactly when the item is a container
/// (ADR-002 D1), as one optional rather than two — nothing here can carry an
/// access with no fullness, or the reverse, and a query never has to ask both
/// separately to know whether a row is a container at all.
public struct InventoryContainment: Hashable, Sendable {
    public var access: InventoryAccess
    public var isFull: Bool

    public init(access: InventoryAccess, isFull: Bool) {
        self.access = access
        self.isFull = isFull
    }
}

/// One item, the shape ADR-002's wire contract declares for `Item`. A
/// container is an item whose type grants containment (D1): `containment` is
/// non-nil exactly when it does.
public struct InventoryItem: Identifiable, Hashable, Sendable {
    public let id: String
    public let revision: Int
    public let seq: Int
    /// Catalogue revision that validated this item's field values.
    public let catalogueRevision: Int?
    public let name: String
    /// Stable catalogue type identity used by protocol 2.
    public let typeId: String?
    public let typeKey: String?
    /// Stable-ID protocol-2 values, ordered as the server returned them.
    /// Empty while the replica is reading the protocol-1 compatibility projection.
    public let fieldValues: [InventoryItemFieldEntry]
    /// The free-text type the item carried before types existed, kept
    /// read-only by the migration and never set by any command. Only an
    /// untyped item's is ever consulted: it is what a newly arrived type's
    /// `legacyLabels` are matched against.
    public let legacyType: String?
    public let fields: [String: InventoryFieldValue]
    public let note: String?
    public let code: String?
    public let externalIds: [InventoryExternalIdentifier]
    public let quantity: InventoryQuantity
    public let lifecycle: InventoryLifecycle
    public let lifecycleChangedAt: Date?
    public let placement: InventoryPlacement
    public let previousPlacement: InventoryPreviousPlacement?
    public let containment: InventoryContainment?
    public let photos: [InventoryPhotoReference]
    public let provenance: InventoryProvenance?
    public let documentsStatus: InventoryDocumentsStatus
    public let documentTitles: [String]
    public let createdAt: Date
    public let updatedAt: Date
    public let deletedAt: Date?

    public init(
        id: String,
        revision: Int,
        seq: Int,
        catalogueRevision: Int? = nil,
        name: String,
        typeId: String? = nil,
        typeKey: String?,
        fieldValues: [InventoryItemFieldEntry] = [],
        legacyType: String? = nil,
        fields: [String: InventoryFieldValue] = [:],
        note: String? = nil,
        code: String? = nil,
        externalIds: [InventoryExternalIdentifier] = [],
        quantity: InventoryQuantity = InventoryQuantity(count: 1),
        lifecycle: InventoryLifecycle = .active,
        lifecycleChangedAt: Date? = nil,
        placement: InventoryPlacement,
        previousPlacement: InventoryPreviousPlacement? = nil,
        containment: InventoryContainment? = nil,
        photos: [InventoryPhotoReference] = [],
        provenance: InventoryProvenance? = nil,
        documentsStatus: InventoryDocumentsStatus = .none,
        documentTitles: [String] = [],
        createdAt: Date,
        updatedAt: Date,
        deletedAt: Date? = nil
    ) {
        self.id = id
        self.revision = revision
        self.seq = seq
        self.catalogueRevision = catalogueRevision
        self.name = name
        self.typeId = typeId
        self.typeKey = typeKey
        self.fieldValues = fieldValues
        self.legacyType = legacyType
        self.fields = fields
        self.note = note
        self.code = code
        self.externalIds = externalIds
        self.quantity = quantity
        self.lifecycle = lifecycle
        self.lifecycleChangedAt = lifecycleChangedAt
        self.placement = placement
        self.previousPlacement = previousPlacement
        self.containment = containment
        self.photos = photos
        self.provenance = provenance
        self.documentsStatus = documentsStatus
        self.documentTitles = documentTitles
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.deletedAt = deletedAt
    }

    public var isContainer: Bool { containment != nil }
    public var isDeleted: Bool { deletedAt != nil }
}
