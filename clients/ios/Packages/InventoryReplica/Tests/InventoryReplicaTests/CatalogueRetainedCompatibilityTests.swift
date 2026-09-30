import AppCore
import Testing

@testable import InventoryReplica

/// ``CatalogueCompatibility/retainedIncompatibility(typeId:fieldIds:values:)``
/// lets values an item already holds survive a retired option or an archived
/// type, as the server does, where a command's new values are refused.
@Suite("Catalogue compatibility: values an item retains")
internal struct CatalogueRetainedCompatibilityTests {
    private typealias Fixture = RebaseFixture

    private static let archived = "2026-09-29T00:00:00.000Z"
    private static let warm = InventoryPrimitiveValue.enumeration(optionId: Fixture.warm)

    private static func check(
        _ fields: [InventoryCatalogueField], typeArchived: Bool = false
    ) -> CatalogueCompatibility {
        let target = Fixture.catalogue(2, fields)
        let types = target.types.map { type in
            InventoryCatalogueType(
                id: type.id, key: type.key, label: type.label, sortOrder: type.sortOrder,
                fields: type.fields, archivedAt: typeArchived ? archived : nil)
        }
        return CatalogueCompatibility(
            authored: Fixture.catalogue(1, Fixture.baseFields),
            target: InventoryCatalogueSnapshot(revision: target.revision, types: types))
    }

    private static func colour(options: [InventoryCatalogueOption]) -> [InventoryCatalogueField] {
        [
            Fixture.field(Fixture.lumens, key: "lumens", kind: .measurement, sortOrder: 0),
            Fixture.field(
                Fixture.colour, key: "colour", kind: .enumeration, sortOrder: 1, options: options),
        ]
    }

    @Test("a retired option the item already holds is retained, though a command may not pick it")
    func retiredOptionIsRetained() {
        let check = Self.check(Self.colour(options: [Fixture.option(archivedAt: Self.archived)]))

        #expect(
            check.retainedIncompatibility(
                typeId: Fixture.typeId, fieldIds: [Fixture.colour], values: [Self.warm]) == nil)
        #expect(
            check.incompatibility(
                typeId: Fixture.typeId, fieldIds: [Fixture.colour], values: [Self.warm],
                requiresAll: false)?.change == .retired)
    }

    @Test("an option gone from the revision still refuses")
    func missingOptionRefuses() {
        let check = Self.check(Self.colour(options: []))

        let found = check.retainedIncompatibility(
            typeId: Fixture.typeId, fieldIds: [Fixture.colour], values: [Self.warm])
        #expect(found?.definition == .option)
        #expect(found?.change == .notInRevision)
    }

    @Test("an archived type keeps the values its item already holds")
    func archivedTypeIsRetained() {
        let check = Self.check(Fixture.baseFields, typeArchived: true)

        #expect(
            check.retainedIncompatibility(
                typeId: Fixture.typeId, fieldIds: [Fixture.colour], values: [Self.warm]) == nil)
        #expect(
            check.incompatibility(
                typeId: Fixture.typeId, fieldIds: [Fixture.colour], values: [Self.warm],
                requiresAll: false)?.change == .archived)
    }
}
