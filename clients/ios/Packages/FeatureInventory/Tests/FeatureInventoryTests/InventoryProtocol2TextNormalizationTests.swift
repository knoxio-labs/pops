import AppCore
import Testing

@testable import FeatureInventory

@Suite("Protocol 2 inventory text normalization")
internal struct InventoryProtocol2TextNormalizationTests {
    @Test("text input trims only its edges and blank text remains absent")
    func textValueNormalization() throws {
        let short = Self.field(kind: .shortText)
        let long = Self.field(kind: .longText)

        guard
            case .value(let shortValue) = InventoryProtocol2ValueText.parse(
                " Ihomdec ", for: short)
        else {
            Issue.record("expected short text to parse")
            return
        }
        #expect(shortValue == .string("Ihomdec"))

        guard
            case .value(let unicodeWhitespaceValue) = InventoryProtocol2ValueText.parse(
                "\u{FEFF}\u{00A0}Ihomdec\u{2028}\u{00A0}", for: short)
        else {
            Issue.record("expected JavaScript whitespace at text edges to be removed")
            return
        }
        #expect(unicodeWhitespaceValue == .string("Ihomdec"))

        guard
            case .value(let blankValue) = InventoryProtocol2ValueText.parse(
                " \t\n ", for: short)
        else {
            Issue.record("expected blank short text to parse as absent")
            return
        }
        #expect(blankValue == nil)

        guard
            case .value(let longValue) = InventoryProtocol2ValueText.parse(
                " \nfirst line\nsecond  line\n ", for: long)
        else {
            Issue.record("expected long text to parse")
            return
        }
        #expect(longValue == .string("first line\nsecond  line"))
    }

    @Test("required text that trims to empty stays a required-field issue")
    func blankRequiredTextIsMissing() throws {
        let field = Self.field(kind: .shortText, required: true)
        let type = Self.type(fields: [field])
        var draft = InventoryProtocol2Draft(type: type, catalogueRevision: 1)
        let entry = try #require(draft.draftEntries(for: field).first)

        draft.setText(" \t\n ", entryId: entry.id, for: field)

        #expect(draft.issues(for: type).map(\.fieldId) == [field.id])
        #expect(draft.issues(for: type).first?.message == "Field is required.")
        #expect(draft.completeValues(for: type).isEmpty)
    }

    private static func type(
        fields: [InventoryCatalogueField]
    ) -> InventoryCatalogueType {
        InventoryCatalogueType(
            id: "type", key: "type", label: "Type", sortOrder: 0, fields: fields)
    }

    private static func field(
        kind: InventoryPrimitiveKind, required: Bool = false
    ) -> InventoryCatalogueField {
        InventoryCatalogueField(
            id: "field", typeId: "type", key: "field", label: "Field", sortOrder: 0,
            kind: kind, cardinality: .one, required: required, storage: .stored, fixedUnit: nil,
            references: .init(), enumOptions: [])
    }
}
