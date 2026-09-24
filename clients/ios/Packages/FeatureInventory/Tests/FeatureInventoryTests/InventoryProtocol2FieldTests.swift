import AppCore
import Testing

@testable import FeatureInventory

@Suite("Protocol 2 inventory field editing")
internal struct InventoryProtocol2FieldTests {
    @Test(
        "many values keep stable identities and their explicit order through add, edit, move, and remove"
    )
    func orderedManyValues() throws {
        let field = Self.field(kind: .longText, cardinality: .many)
        let type = Self.type(fields: [field])
        var draft = InventoryProtocol2Draft(type: type, catalogueRevision: 7)

        #expect(draft.draftEntries(for: field).isEmpty)
        #expect(draft.completeValues(for: type).isEmpty)

        draft.addEntry(id: "first", for: field)
        draft.setText("alpha", entryId: "first", for: field)
        #expect(draft.draftEntries(for: field).map(\.id) == ["first"])
        #expect(draft.values(for: field) == [.string("alpha")])

        draft.addEntry(id: "second", for: field)
        draft.setText("beta", entryId: "second", for: field)
        #expect(draft.draftEntries(for: field).map(\.id) == ["first", "second"])
        #expect(draft.values(for: field) == [.string("alpha"), .string("beta")])

        draft.moveEntry(id: "second", by: -1, for: field)
        #expect(draft.draftEntries(for: field).map(\.id) == ["second", "first"])
        #expect(draft.values(for: field) == [.string("beta"), .string("alpha")])

        draft.removeEntry(id: "second", for: field)
        draft.removeEntry(id: "first", for: field)
        #expect(draft.draftEntries(for: field).isEmpty)
        let patch = try #require(draft.patches(for: type).first)
        #expect(patch.fieldId == field.id)
        #expect(patch.values == nil)
    }

    @Test("required checks value presence without inventing a minimum for optional many fields")
    func requiredAndOptionalCardinality() {
        let optional = Self.field(id: "optional", kind: .shortText, cardinality: .many)
        let required = Self.field(id: "required", kind: .shortText, required: true)
        let type = Self.type(fields: [optional, required])
        var draft = InventoryProtocol2Draft(type: type, catalogueRevision: 1)

        #expect(draft.issues(for: type).map(\.fieldId) == ["required"])
        #expect(draft.issues(for: type).first?.message == "Field is required.")

        guard let entry = draft.draftEntries(for: required).first else {
            Issue.record("a one-value field must have one draft entry")
            return
        }
        draft.setText("present", entryId: entry.id, for: required)
        #expect(draft.issues(for: type).isEmpty)
        #expect(draft.completeValues(for: type).map(\.fieldId) == ["required"])
    }

    @Test("a required flag starts as the off its switch shows; an optional one stays unrecorded")
    func flagStartingValues() {
        let optional = Self.field(id: "optional", kind: .boolean)
        let required = Self.field(id: "required", kind: .boolean, required: true)
        let type = Self.type(fields: [optional, required])
        let draft = InventoryProtocol2Draft(type: type, catalogueRevision: 1)

        #expect(draft.values(for: optional).isEmpty)
        #expect(draft.values(for: required) == [.boolean(false)])
        #expect(draft.issues(for: type).isEmpty)
        #expect(!draft.hasStagedWork)
    }

    @Test("text, numbers, dates, times, URLs, and measurements reject malformed boundary input")
    func primitiveBoundaries() {
        Self.assertValue(String(repeating: "x", count: 200), field: Self.field(kind: .shortText))
        Self.assertIssue(String(repeating: "x", count: 201), field: Self.field(kind: .shortText))
        Self.assertValue(String(repeating: "x", count: 20_000), field: Self.field(kind: .longText))
        Self.assertIssue(String(repeating: "x", count: 20_001), field: Self.field(kind: .longText))

        Self.assertValue("9007199254740991", field: Self.field(kind: .integer))
        Self.assertIssue("9007199254740992", field: Self.field(kind: .integer))
        Self.assertValue("123456789.123456789", field: Self.field(kind: .decimal))
        Self.assertIssue("123456789.1234567890", field: Self.field(kind: .decimal))
        Self.assertValue("2024-02-29", field: Self.field(kind: .date))
        Self.assertIssue("2025-02-29", field: Self.field(kind: .date))
        Self.assertValue(
            "2026-09-22T04:05:06.123Z", field: Self.field(kind: .dateTime))
        Self.assertIssue("2026-09-22T04:05:06Z", field: Self.field(kind: .dateTime))
        Self.assertValue("https://example.com/a b", field: Self.field(kind: .url))
        Self.assertIssue("http://example.com", field: Self.field(kind: .url))
        Self.assertValue("48.000", field: Self.field(kind: .measurement, fixedUnit: "kg"))
        Self.assertIssue("-0.0", field: Self.field(kind: .measurement, fixedUnit: "kg"))
    }

    @Test("an invalid edit remains in the draft, reports how to fix it, and cannot become a write")
    func malformedInputIsNotDeletion() throws {
        let field = Self.field(kind: .integer, required: true)
        let type = Self.type(fields: [field])
        var draft = InventoryProtocol2Draft(type: type, catalogueRevision: 2)
        let entry = try #require(draft.draftEntries(for: field).first)

        draft.setText("twelve", entryId: entry.id, for: field)

        #expect(draft.draftEntries(for: field).first?.input == "twelve")
        #expect(draft.draftEntries(for: field).first?.value == nil)
        #expect(draft.issues(for: type).count == 2)
        #expect(draft.issues(for: type).first?.message.contains("whole number") == true)
        #expect(draft.completeValues(for: type).isEmpty)
    }

    @Test("reference candidates obey kind and item-type constraints")
    func referenceConstraints() {
        let field = Self.field(
            kind: .reference,
            references: .init(targetKinds: [.item, .location], targetTypeIds: ["cable"]))
        let targets = [
            InventoryProtocol2ReferenceTarget(
                kind: .item, id: "cable-1", label: "Cable", typeId: "cable"),
            InventoryProtocol2ReferenceTarget(
                kind: .item, id: "box-1", label: "Box", typeId: "box"),
            InventoryProtocol2ReferenceTarget(
                kind: .location, id: "garage", label: "Garage", typeId: nil),
        ]

        #expect(
            InventoryProtocol2ReferenceTargets.allowed(for: field, among: targets).map(\.id)
                == ["cable-1", "garage"])
    }

    @Test("a reference kind remains selected while its record is changed")
    func referenceKindSelection() throws {
        let field = Self.field(
            kind: .reference,
            references: .init(targetKinds: [.item, .location]))
        let type = Self.type(fields: [field])
        var draft = InventoryProtocol2Draft(type: type, catalogueRevision: 1)
        let entry = try #require(draft.draftEntries(for: field).first)

        draft.setReferenceKind(.location, entryId: entry.id, for: field)
        #expect(draft.draftEntries(for: field).first?.referenceKind == .location)
        #expect(draft.draftEntries(for: field).first?.value == nil)

        let location = InventoryReferenceValue(
            targetKind: .location, targetId: "garage", targetState: .resolved)
        draft.setValue(.reference(location), entryId: entry.id, for: field)
        #expect(draft.draftEntries(for: field).first?.referenceKind == .location)
        #expect(draft.values(for: field) == [.reference(location)])

        draft.setReferenceKind(.item, entryId: entry.id, for: field)
        #expect(draft.draftEntries(for: field).first?.referenceKind == .item)
        #expect(draft.draftEntries(for: field).first?.value == nil)
    }

    @Test("retired enum values remain readable and retained, but are not newly selectable")
    func retiredEnumeration() {
        let active = InventoryCatalogueOption(
            id: "active", key: "active", label: "Active", sortOrder: 2)
        let retired = InventoryCatalogueOption(
            id: "retired", key: "retired", label: "Old", sortOrder: 1,
            archivedAt: "2026-09-01")
        let first = InventoryCatalogueOption(
            id: "first", key: "first", label: "First", sortOrder: 0)
        let field = Self.field(kind: .enumeration, enumOptions: [active, retired, first])

        #expect(
            InventoryProtocol2EnumOptions.selectable(for: field, retaining: nil).map(\.id)
                == ["first", "active"])
        #expect(
            InventoryProtocol2EnumOptions.selectable(for: field, retaining: "retired").map(\.id)
                == ["first", "retired", "active"])
        #expect(
            InventoryProtocol2Display.text(
                for: [.enumeration(optionId: "retired")], field: field,
                referenceLabel: { _ in nil }) == "Old (Retired)")
    }

    @Test(
        "references retain identity while live names, deletion, and unavailability change presentation"
    )
    func referencePresentation() {
        let field = Self.field(kind: .reference)
        let reference = InventoryReferenceValue(
            targetKind: .item, targetId: "item-1", targetState: .resolved)
        #expect(
            InventoryProtocol2Display.text(
                for: [.reference(reference)], field: field,
                referenceLabel: { _ in "Renamed cable" }) == "Renamed cable")

        let deleted = InventoryReferenceValue(
            targetKind: .item, targetId: "item-1", targetState: .deleted)
        #expect(
            InventoryProtocol2Display.text(
                for: [.reference(deleted)], field: field,
                referenceLabel: { _ in nil }) == "Deleted item")
        #expect(
            InventoryProtocol2Display.unavailable(.referenceMissing)
                == "Unavailable because the referenced record is missing")
    }

    private static func assertValue(_ input: String, field: InventoryCatalogueField) {
        guard case .value(.some) = InventoryProtocol2ValueText.parse(input, for: field) else {
            Issue.record("expected \(field.kind) to accept boundary input")
            return
        }
    }

    private static func assertIssue(_ input: String, field: InventoryCatalogueField) {
        guard case .issue = InventoryProtocol2ValueText.parse(input, for: field) else {
            Issue.record("expected \(field.kind) to reject malformed input")
            return
        }
    }

    private static func type(
        fields: [InventoryCatalogueField]
    ) -> InventoryCatalogueType {
        InventoryCatalogueType(
            id: "type", key: "type", label: "Type", sortOrder: 0, fields: fields)
    }

    private static func field(
        id: String = "field", kind: InventoryPrimitiveKind,
        cardinality: InventoryFieldCardinality = .one, required: Bool = false,
        fixedUnit: String? = nil, references: InventoryReferenceConstraint = .init(),
        enumOptions: [InventoryCatalogueOption] = []
    ) -> InventoryCatalogueField {
        InventoryCatalogueField(
            id: id, typeId: "type", key: id, label: "Field", sortOrder: 0, kind: kind,
            cardinality: cardinality, required: required, storage: .stored,
            fixedUnit: fixedUnit, references: references, enumOptions: enumOptions)
    }
}
