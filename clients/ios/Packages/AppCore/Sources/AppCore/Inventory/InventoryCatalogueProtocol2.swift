/// An enum option whose stable identity survives label and order changes.
public struct InventoryCatalogueOption: Codable, Identifiable, Hashable, Sendable {
    public let id: String
    public let key: String
    public let label: String
    public let sortOrder: Int
    public let archivedAt: String?

    public init(
        id: String, key: String, label: String, sortOrder: Int, archivedAt: String? = nil
    ) {
        self.id = id
        self.key = key
        self.label = label
        self.sortOrder = sortOrder
        self.archivedAt = archivedAt
    }
}

/// A complete immutable field definition from one catalogue revision.
public struct InventoryCatalogueField: Codable, Identifiable, Hashable, Sendable {
    public let id: String
    public let typeId: String
    public let key: String
    public let label: String
    public let help: String?
    public let sortOrder: Int
    public let kind: InventoryPrimitiveKind
    public let cardinality: InventoryFieldCardinality
    public let required: Bool
    public let storage: InventoryFieldStorage
    public let fixedUnit: String?
    public let references: InventoryReferenceConstraint
    public let expressionVersion: Int?
    public let expression: InventoryJSON?
    public let allowOverride: Bool
    public let presentation: InventoryJSON
    public let archivedAt: String?
    public let enumOptions: [InventoryCatalogueOption]

    public init(
        id: String, typeId: String, key: String, label: String, help: String? = nil,
        sortOrder: Int, kind: InventoryPrimitiveKind, cardinality: InventoryFieldCardinality,
        required: Bool, storage: InventoryFieldStorage, fixedUnit: String? = nil,
        references: InventoryReferenceConstraint = .init(), expressionVersion: Int? = nil,
        expression: InventoryJSON? = nil, allowOverride: Bool = false,
        presentation: InventoryJSON = .object([:]), archivedAt: String? = nil,
        enumOptions: [InventoryCatalogueOption] = []
    ) {
        self.id = id
        self.typeId = typeId
        self.key = key
        self.label = label
        self.help = help
        self.sortOrder = sortOrder
        self.kind = kind
        self.cardinality = cardinality
        self.required = required
        self.storage = storage
        self.fixedUnit = fixedUnit
        self.references = references
        self.expressionVersion = expressionVersion
        self.expression = expression
        self.allowOverride = allowOverride
        self.presentation = presentation
        self.archivedAt = archivedAt
        self.enumOptions = enumOptions
    }
}

/// A complete immutable type definition from one catalogue revision.
public struct InventoryCatalogueType: Codable, Identifiable, Hashable, Sendable {
    public let id: String
    public let key: String
    public let label: String
    public let description: String?
    public let sortOrder: Int
    public let fields: [InventoryCatalogueField]
    public let capabilities: [String]
    public let legacyLabels: [String]
    public let presentation: InventoryJSON
    public let archivedAt: String?

    public init(
        id: String, key: String, label: String, description: String? = nil, sortOrder: Int,
        fields: [InventoryCatalogueField] = [], capabilities: [String] = [],
        legacyLabels: [String] = [], presentation: InventoryJSON = .object([:]),
        archivedAt: String? = nil
    ) {
        self.id = id
        self.key = key
        self.label = label
        self.description = description
        self.sortOrder = sortOrder
        self.fields = fields
        self.capabilities = capabilities
        self.legacyLabels = legacyLabels
        self.presentation = presentation
        self.archivedAt = archivedAt
    }
}

/// Lifecycle state recorded on an immutable catalogue revision.
public enum InventoryCatalogueRevisionStatus: String, Codable, Hashable, Sendable {
    case draft
    case published
    case abandoned
}

/// Identity and protocol floor of one catalogue snapshot.
public struct InventoryCatalogueRevision: Codable, Hashable, Sendable {
    public let revision: Int
    public let baseRevision: Int?
    public let status: InventoryCatalogueRevisionStatus
    public let minimumProtocol: Int

    public init(
        revision: Int, baseRevision: Int? = nil,
        status: InventoryCatalogueRevisionStatus = .published, minimumProtocol: Int
    ) {
        self.revision = revision
        self.baseRevision = baseRevision
        self.status = status
        self.minimumProtocol = minimumProtocol
    }
}

/// Complete immutable protocol-2 catalogue snapshot stored by the replica.
public struct InventoryCatalogueSnapshot: Codable, Hashable, Sendable {
    public let revision: InventoryCatalogueRevision
    public let types: [InventoryCatalogueType]

    public init(revision: InventoryCatalogueRevision, types: [InventoryCatalogueType]) {
        self.revision = revision
        self.types = types
    }
}
