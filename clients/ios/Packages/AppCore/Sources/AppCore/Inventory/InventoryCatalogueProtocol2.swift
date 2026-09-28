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
    /// The canonical values a client pre-fills this field with when a new
    /// item is created, typed by ``kind``; empty when the field has none. Only
    /// a stored, non-reference field carries any, and a one-value field at
    /// most one. The server never applies them.
    public let defaultValues: [InventoryPrimitiveValue]
    public let presentation: InventoryJSON
    public let archivedAt: String?
    /// The field that took over this archived field's values, when the
    /// catalogue records one.
    public let replacedBy: String?
    public let enumOptions: [InventoryCatalogueOption]

    public init(
        id: String, typeId: String, key: String, label: String, help: String? = nil,
        sortOrder: Int, kind: InventoryPrimitiveKind, cardinality: InventoryFieldCardinality,
        required: Bool, storage: InventoryFieldStorage, fixedUnit: String? = nil,
        references: InventoryReferenceConstraint = .init(), expressionVersion: Int? = nil,
        expression: InventoryJSON? = nil, allowOverride: Bool = false,
        defaultValues: [InventoryPrimitiveValue] = [],
        presentation: InventoryJSON = .object([:]), archivedAt: String? = nil,
        replacedBy: String? = nil, enumOptions: [InventoryCatalogueOption] = []
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
        self.defaultValues = defaultValues
        self.presentation = presentation
        self.archivedAt = archivedAt
        self.replacedBy = replacedBy
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
    /// The type that took over this archived type's items, when the
    /// catalogue records one.
    public let replacedBy: String?
    /// The parent type whose fields and capabilities the phone resolves for
    /// this type; `nil` identifies a root type.
    public let parentTypeId: String?

    public init(
        id: String, key: String, label: String, description: String? = nil, sortOrder: Int,
        fields: [InventoryCatalogueField] = [], capabilities: [String] = [],
        legacyLabels: [String] = [], presentation: InventoryJSON = .object([:]),
        archivedAt: String? = nil, replacedBy: String? = nil, parentTypeId: String? = nil
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
        self.replacedBy = replacedBy
        self.parentTypeId = parentTypeId
    }

    /// Whether this type grants the containment capability (ADR-002 D1). A
    /// container must have quantity exactly 1 (D3).
    public var isContainer: Bool { capabilities.contains("containment") }
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

    /// The known parent chain for `typeId`, ordered from the oldest known
    /// ancestor to the type. Missing parents and repeated ids end the walk.
    public func ancestry(ofType typeId: String) -> [InventoryCatalogueType] {
        var current = types.first { $0.id == typeId }
        var visited: Set<String> = []
        var chain: [InventoryCatalogueType] = []

        while let type = current, visited.insert(type.id).inserted {
            chain.append(type)
            current = type.parentTypeId.flatMap { parentId in
                types.first { $0.id == parentId }
            }
        }
        return Array(chain.reversed())
    }

    /// The type's own definition with inherited fields and capabilities
    /// resolved from its known parent chain.
    public func effectiveType(id typeId: String) -> InventoryCatalogueType? {
        guard let own = types.first(where: { $0.id == typeId }) else { return nil }
        let chain = ancestry(ofType: typeId)
        var capabilities: [String] = []
        var capabilityIds: Set<String> = []
        for type in chain {
            for capability in type.capabilities where capabilityIds.insert(capability).inserted {
                capabilities.append(capability)
            }
        }
        return InventoryCatalogueType(
            id: own.id, key: own.key, label: own.label, description: own.description,
            sortOrder: own.sortOrder,
            fields: chain.flatMap { type in
                type.fields.sorted(by: Self.fieldOrder)
            },
            capabilities: capabilities, legacyLabels: own.legacyLabels,
            presentation: own.presentation, archivedAt: own.archivedAt,
            replacedBy: own.replacedBy, parentTypeId: own.parentTypeId)
    }

    /// Whether `typeId` is the same as or descends from `ancestorTypeId`.
    public func type(_ typeId: String, isOrDescendsFrom ancestorTypeId: String) -> Bool {
        ancestry(ofType: typeId).contains { $0.id == ancestorTypeId }
    }

    private static func fieldOrder(
        _ left: InventoryCatalogueField, _ right: InventoryCatalogueField
    ) -> Bool {
        left.sortOrder != right.sortOrder ? left.sortOrder < right.sortOrder : left.key < right.key
    }
}
