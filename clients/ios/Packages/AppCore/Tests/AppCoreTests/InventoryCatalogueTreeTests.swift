import AppCore
import Testing

@Suite("Inventory catalogue type trees")
internal struct InventoryCatalogueTreeTests {
    private static let bedding = "10000000-0000-4000-8000-000000000001"
    private static let sheet = "10000000-0000-4000-8000-000000000002"
    private static let quiltCover = "10000000-0000-4000-8000-000000000003"
    private static let size = "10000000-0000-4000-8000-000000000011"
    private static let computed = "10000000-0000-4000-8000-000000000012"
    private static let fitted = "10000000-0000-4000-8000-000000000013"
    private static let closure = "10000000-0000-4000-8000-000000000014"

    private static func field(
        _ id: String, typeId: String, key: String, sortOrder: Int,
        storage: InventoryFieldStorage = .stored
    ) -> InventoryCatalogueField {
        InventoryCatalogueField(
            id: id, typeId: typeId, key: key, label: key, sortOrder: sortOrder,
            kind: storage == .computed ? .boolean : .shortText, cardinality: .one,
            required: false, storage: storage,
            expressionVersion: storage == .computed ? 1 : nil,
            expression: storage == .computed
                ? .object(["op": .string("literal"), "value": .boolean(true)]) : nil)
    }

    private static let catalogue = InventoryCatalogueSnapshot(
        revision: InventoryCatalogueRevision(revision: 1, minimumProtocol: 2),
        types: [
            InventoryCatalogueType(
                id: bedding, key: "bedding", label: "Bedding", sortOrder: 0,
                fields: [
                    field(size, typeId: bedding, key: "size", sortOrder: 0),
                    field(
                        computed, typeId: bedding, key: "computed", sortOrder: 1, storage: .computed
                    ),
                ], capabilities: ["containment", "shared"]),
            InventoryCatalogueType(
                id: sheet, key: "sheet", label: "Sheet", sortOrder: 1,
                fields: [field(fitted, typeId: sheet, key: "fitted", sortOrder: 0)],
                capabilities: ["shared", "sheet-only"], parentTypeId: bedding),
            InventoryCatalogueType(
                id: quiltCover, key: "quilt_cover", label: "Quilt cover", sortOrder: 2,
                fields: [field(closure, typeId: quiltCover, key: "closure", sortOrder: 0)],
                parentTypeId: bedding),
        ])

    @Test("a child resolves inherited fields in root-to-child order and keeps their owners")
    func effectiveFieldsKeepDeclarationOrderAndOwner() throws {
        let type = try #require(Self.catalogue.effectiveType(id: Self.sheet))

        #expect(type.fields.map(\.id) == [Self.size, Self.computed, Self.fitted])
        #expect(type.fields.map(\.typeId) == [Self.bedding, Self.bedding, Self.sheet])
    }

    @Test("a child inherits and deduplicates capabilities")
    func effectiveCapabilitiesContainAncestors() throws {
        let type = try #require(Self.catalogue.effectiveType(id: Self.sheet))

        #expect(type.capabilities == ["containment", "shared", "sheet-only"])
    }

    @Test("a two-type cycle terminates while resolving ancestry")
    func cyclicAncestryTerminates() {
        let first = InventoryCatalogueType(
            id: "a", key: "a", label: "A", sortOrder: 0,
            fields: [Self.field("a-field", typeId: "a", key: "a", sortOrder: 0)],
            parentTypeId: "b")
        let second = InventoryCatalogueType(
            id: "b", key: "b", label: "B", sortOrder: 1,
            fields: [Self.field("b-field", typeId: "b", key: "b", sortOrder: 0)],
            parentTypeId: "a")
        let catalogue = InventoryCatalogueSnapshot(
            revision: InventoryCatalogueRevision(revision: 1, minimumProtocol: 2),
            types: [first, second])

        #expect(catalogue.ancestry(ofType: "a").map(\.id) == ["b", "a"])
    }

    @Test("a type matches itself and descendants but not its descendants' ancestors")
    func descendantCheckFollowsParentChain() {
        #expect(Self.catalogue.type(Self.sheet, isOrDescendsFrom: Self.sheet))
        #expect(Self.catalogue.type(Self.sheet, isOrDescendsFrom: Self.bedding))
        #expect(!Self.catalogue.type(Self.bedding, isOrDescendsFrom: Self.sheet))
    }
}
