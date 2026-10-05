import AppCore
import Testing

@testable import InventoryReplica

@Suite("Inventory text value normalization")
internal struct TextValueNormalizationTests {
    private static let revision = 12
    private static let typeId = "51000000-0000-4000-8000-000000000001"
    private static let requiredFieldId = "51000000-0000-4000-8000-000000000011"
    private static let optionalFieldId = "51000000-0000-4000-8000-000000000012"
    private static let longTextFieldId = "51000000-0000-4000-8000-000000000013"
    private static let itemId = "51000000-0000-4000-8000-000000000101"

    @Test("offline create trims text edges and preserves internal spacing and line breaks")
    func createPersistsNormalizedText() throws {
        let replica = try Self.replica()
        _ = try replica.perform(
            Self.create(
                values: [
                    .init(fieldId: Self.requiredFieldId, values: [.string(" Ihomdec ")]),
                    .init(fieldId: Self.optionalFieldId, values: [.string("a  b")]),
                    .init(
                        fieldId: Self.longTextFieldId,
                        values: [.string(" \nfirst line\nsecond  line\n ")]),
                ]),
            mutationId: "create-normalized-text", clientTime: Fixture.created)

        let item = try #require(try replica.read(.item(id: Self.itemId)))
        #expect(
            item.fieldValues.first(where: { $0.fieldId == Self.requiredFieldId })?.state
                == .value([.string("Ihomdec")]))
        #expect(
            item.fieldValues.first(where: { $0.fieldId == Self.optionalFieldId })?.state
                == .value([.string("a  b")]))
        #expect(
            item.fieldValues.first(where: { $0.fieldId == Self.longTextFieldId })?.state
                == .value([.string("first line\nsecond  line")]))
    }

    @Test("offline edit clears an optional text field whose replacement is blank")
    func blankOptionalReplacementClearsField() throws {
        let replica = try Self.replica()
        _ = try replica.perform(
            Self.create(
                values: [
                    .init(fieldId: Self.requiredFieldId, values: [.string("Serial")]),
                    .init(fieldId: Self.optionalFieldId, values: [.string("Ihomdec")]),
                ]),
            mutationId: "create-before-clear", clientTime: Fixture.created)

        _ = try replica.perform(
            .editProtocol2Item(
                id: Self.itemId,
                catalogueRevision: Self.revision,
                values: [
                    .init(fieldId: Self.optionalFieldId, values: [.string(" \t\n ")])
                ]),
            mutationId: "clear-blank-text", clientTime: Fixture.created)

        let item = try #require(try replica.read(.item(id: Self.itemId)))
        #expect(item.fieldValues.first(where: { $0.fieldId == Self.optionalFieldId }) == nil)
        #expect(item.fieldValues.first(where: { $0.fieldId == Self.requiredFieldId }) != nil)
    }

    @Test("offline create refuses required text that trims to empty without logging it")
    func blankRequiredTextIsRejectedBeforeLogging() throws {
        let replica = try Self.replica()

        let reason = Self.rejection {
            _ = try replica.perform(
                Self.create(
                    values: [
                        .init(fieldId: Self.requiredFieldId, values: [.string(" \t\n ")])
                    ]),
                mutationId: "reject-blank-required-text", clientTime: Fixture.created)
        }

        #expect(reason == .invalid)
        #expect(try replica.read(.item(id: Self.itemId)) == nil)
        #expect(try replica.outboundMutations().isEmpty)
    }

    private static func replica() throws -> InventoryReplica {
        let fields = [
            InventoryCatalogueField(
                id: requiredFieldId, typeId: typeId, key: "brand", label: "Brand", sortOrder: 0,
                kind: .shortText, cardinality: .one, required: true, storage: .stored),
            InventoryCatalogueField(
                id: optionalFieldId, typeId: typeId, key: "alias", label: "Alias", sortOrder: 1,
                kind: .shortText, cardinality: .one, required: false, storage: .stored),
            InventoryCatalogueField(
                id: longTextFieldId, typeId: typeId, key: "notes", label: "Notes", sortOrder: 2,
                kind: .longText, cardinality: .one, required: false, storage: .stored),
        ]
        let catalogue = InventoryCatalogueSnapshot(
            revision: InventoryCatalogueRevision(revision: revision, minimumProtocol: 2),
            types: [
                InventoryCatalogueType(
                    id: typeId, key: "item", label: "Item", sortOrder: 0, fields: fields)
            ])
        let replica = try InventoryReplica(now: { Fixture.created })
        try replica.store(catalogue)
        return replica
    }

    private static func create(values: [InventoryProtocol2FieldValue]) -> InventoryCommand {
        .createProtocol2Item(
            InventoryNewProtocol2Item(
                id: itemId, name: "Item", catalogueRevision: revision, typeId: typeId,
                values: values, placement: .hand))
    }

    private static func rejection(_ operation: () throws -> Void) -> InventoryRejectedReason? {
        do {
            try operation()
            return nil
        } catch InventoryCommandError.rejected(let reason, _) {
            return reason
        } catch {
            return nil
        }
    }
}
