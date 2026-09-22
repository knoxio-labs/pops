import Testing

@testable import AppCore

@Suite("Inventory protocol 2 values")
internal struct InventoryProtocol2Tests {
    @Test("decimal scale survives and invalid spellings are refused")
    func decimalCanonicalForm() throws {
        #expect(try InventoryInteger(9_007_199_254_740_991).value == 9_007_199_254_740_991)
        #expect(throws: InventoryCanonicalValueError.integer) {
            try InventoryInteger(9_007_199_254_740_992)
        }
        #expect(try InventoryDecimal("48.000").text == "48.000")
        #expect(throws: InventoryCanonicalValueError.decimal) { try InventoryDecimal("48e3") }
        #expect(throws: InventoryCanonicalValueError.decimal) { try InventoryDecimal("-0.0") }
        #expect(throws: InventoryCanonicalValueError.decimal) {
            try InventoryDecimal("1234567890123456789")
        }
    }

    @Test("calendar, timestamp and URL wrappers reject non-canonical values")
    func canonicalStrings() throws {
        #expect(try InventoryCanonicalDate("2024-02-29").text == "2024-02-29")
        #expect(throws: InventoryCanonicalValueError.date) {
            try InventoryCanonicalDate("2025-02-29")
        }
        #expect(
            try InventoryCanonicalDateTime("2026-09-22T04:05:06.123Z").text
                == "2026-09-22T04:05:06.123Z")
        #expect(throws: InventoryCanonicalValueError.dateTime) {
            try InventoryCanonicalDateTime("2026-09-22T04:05:06Z")
        }
        #expect(
            try InventoryCanonicalURL("https://EXAMPLE.com:443/a/../b").text
                == "https://example.com/b")
        #expect(throws: InventoryCanonicalValueError.url) {
            try InventoryCanonicalURL("http://example.com")
        }
    }

    @Test("stable revision, field and option identities do not depend on labels")
    func catalogueIdentity() {
        let option = InventoryCatalogueOption(
            id: "option-id", key: "usb-c", label: "USB-C", sortOrder: 0)
        let field = InventoryCatalogueField(
            id: "field-id", typeId: "type-id", key: "connector", label: "Connector",
            sortOrder: 0, kind: .enumeration, cardinality: .many, required: false,
            storage: .stored, enumOptions: [option])
        let catalogue = InventoryCatalogueSnapshot(
            revision: InventoryCatalogueRevision(revision: 12, minimumProtocol: 2),
            types: [
                InventoryCatalogueType(
                    id: "type-id", key: "cable", label: "Cable", sortOrder: 0,
                    fields: [field])
            ])

        #expect(catalogue.revision.revision == 12)
        #expect(catalogue.types[0].fields[0].enumOptions[0].id == "option-id")
    }

    @Test("a deleted reference keeps its stable target identity")
    func referenceIdentity() {
        let reference = InventoryReferenceValue(
            targetKind: .item, targetId: "item-id", targetState: .deleted)
        let entry = InventoryItemFieldEntry(
            fieldId: "field-id", state: .value([.reference(reference)]), source: .stored,
            catalogueRevision: 2)

        #expect(entry.state == .value([.reference(reference)]))
        #expect(reference.targetId == "item-id")
        #expect(reference.targetState == .deleted)
    }

    @Test("unavailable computed values carry a reason and their revision pin")
    func unavailableComputedValue() {
        let entry = InventoryItemFieldEntry(
            fieldId: "field-id", state: .unavailable(reason: .referenceUnresolved),
            source: .computed, catalogueRevision: 7,
            dependencies: [
                InventoryValueDependency(itemId: "item-id", fieldId: "ref-id", revision: 3)
            ])

        #expect(entry.catalogueRevision == 7)
        #expect(entry.state == .unavailable(reason: .referenceUnresolved))
        #expect(entry.dependencies.first?.revision == 3)
    }
}
