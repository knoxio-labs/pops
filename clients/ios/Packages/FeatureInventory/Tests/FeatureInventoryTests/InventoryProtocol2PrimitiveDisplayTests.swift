import AppCore
import Testing

@testable import FeatureInventory

@Suite("Protocol 2 primitive display")
internal struct InventoryProtocol2PrimitiveDisplayTests {
    private struct DisplayCase {
        let value: InventoryPrimitiveValue
        let field: InventoryCatalogueField
        let expected: String
    }

    @Test("every primitive kind has a complete detail representation")
    func primitiveDisplay() throws {
        let enumOption = InventoryCatalogueOption(
            id: "usb-c", key: "usb-c", label: "USB-C", sortOrder: 0)
        let cases = try Self.displayCases(enumOption: enumOption)

        for item in cases {
            #expect(
                InventoryProtocol2Display.text(
                    for: [item.value], field: item.field,
                    referenceLabel: { $0.targetId == "garage" ? "Garage" : nil })
                    == item.expected)
        }
    }

    private static func displayCases(
        enumOption: InventoryCatalogueOption
    ) throws -> [DisplayCase] {
        [
            DisplayCase(value: .string("Cable"), field: field(.shortText), expected: "Cable"),
            DisplayCase(
                value: .string("A long note"), field: field(.longText), expected: "A long note"),
            DisplayCase(
                value: .integer(try InventoryInteger(42)), field: field(.integer), expected: "42"),
            DisplayCase(
                value: .decimal(try InventoryDecimal("12.30")), field: field(.decimal),
                expected: "12.30"),
            DisplayCase(value: .boolean(true), field: field(.boolean), expected: "Yes"),
            DisplayCase(
                value: .enumeration(optionId: enumOption.id),
                field: field(.enumeration, enumOptions: [enumOption]), expected: "USB-C"),
            DisplayCase(
                value: .measurement(amount: try InventoryDecimal("48.000"), unit: "kg"),
                field: field(.measurement, fixedUnit: "kg"), expected: "48.000 kg"),
            DisplayCase(
                value: .date(try InventoryCanonicalDate("2024-02-29")), field: field(.date),
                expected: "2024-02-29"),
            DisplayCase(
                value: .dateTime(
                    try InventoryCanonicalDateTime("2026-09-22T04:05:06.123Z")),
                field: field(.dateTime), expected: "2026-09-22T04:05:06.123Z"),
            DisplayCase(
                value: .url(try InventoryCanonicalURL("https://example.com/cable")),
                field: field(.url), expected: "https://example.com/cable"),
            DisplayCase(
                value: .reference(
                    InventoryReferenceValue(
                        targetKind: .location, targetId: "garage", targetState: .resolved)),
                field: field(.reference), expected: "Garage"),
        ]
    }

    private static func field(
        _ kind: InventoryPrimitiveKind, fixedUnit: String? = nil,
        enumOptions: [InventoryCatalogueOption] = []
    ) -> InventoryCatalogueField {
        InventoryCatalogueField(
            id: kind.rawValue, typeId: "type", key: kind.rawValue, label: kind.rawValue,
            sortOrder: 0, kind: kind, cardinality: .one, required: false, storage: .stored,
            fixedUnit: fixedUnit, enumOptions: enumOptions)
    }
}
