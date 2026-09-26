import AppCore
import Testing

@testable import FeatureInventory

@Suite("Inventory prefill validation")
internal struct InventoryPrefillValidatorTests {
    @Test("malformed values and inactive choices are dropped")
    func rejectsMalformedValues() {
        let integer = InventoryPrefillTestSupport.field(id: "integer", kind: .integer)
        let decimal = InventoryPrefillTestSupport.field(id: "decimal", kind: .decimal)
        let date = InventoryPrefillTestSupport.field(id: "date", kind: .date)
        let dateTime = InventoryPrefillTestSupport.field(id: "date-time", kind: .dateTime)
        let url = InventoryPrefillTestSupport.field(id: "url", kind: .url)
        let shortText = InventoryPrefillTestSupport.field(id: "short-text", kind: .shortText)
        let whitespace = InventoryPrefillTestSupport.field(id: "whitespace")
        let active = InventoryPrefillTestSupport.option(id: "active", label: "Active")
        let archived = InventoryPrefillTestSupport.option(
            id: "archived", label: "Archived", archivedAt: "2026-09-01")
        let enumeration = InventoryPrefillTestSupport.field(
            id: "enumeration", kind: .enumeration, enumOptions: [active, archived])
        let one = InventoryPrefillTestSupport.field(id: "one", cardinality: .one)
        let fields = [
            integer, decimal, date, dateTime, url, shortText, whitespace, enumeration, one,
        ]

        let raw: [String: InventoryPrefillRawValue] = [
            "integer": .text("not an integer"),
            "decimal": .text("1.2345678901"),
            "date": .text("2025-02-29"),
            "date-time": .text("2026-09-22T04:05:06Z"),
            "url": .text("/relative/path"),
            "short-text": .text(String(repeating: "x", count: 201)),
            "whitespace": .text(" \n\t"),
            "enumeration": .texts(["Unknown", "Archived"]),
            "one": .texts(["first", "second"]),
            "unknown": .text("ignored"),
        ]

        #expect(InventoryPrefillValidator.validate(raw, fields: fields).isEmpty)
    }

    @Test("accepted text and number values are parsed into canonical primitives")
    func acceptedTextAndNumberValuesAreParsed() throws {
        let fields = [
            InventoryPrefillTestSupport.field(id: "short-text"),
            InventoryPrefillTestSupport.field(id: "long-text", kind: .longText),
            InventoryPrefillTestSupport.field(id: "integer", kind: .integer),
            InventoryPrefillTestSupport.field(id: "decimal", kind: .decimal),
            InventoryPrefillTestSupport.field(id: "date", kind: .date),
            InventoryPrefillTestSupport.field(id: "date-time", kind: .dateTime),
            InventoryPrefillTestSupport.field(id: "url", kind: .url),
        ]
        let raw: [String: InventoryPrefillRawValue] = [
            "short-text": .text("name"),
            "long-text": .text("a longer note"),
            "integer": .text("42"),
            "decimal": .text("12.30"),
            "date": .text("2026-09-22"),
            "date-time": .text("2026-09-22T04:05:06.123Z"),
            "url": .text("https://example.com/a b"),
        ]

        #expect(
            InventoryPrefillValidator.validate(raw, fields: fields) == [
                "short-text": [.string("name")],
                "long-text": [.string("a longer note")],
                "integer": [.integer(try InventoryInteger(42))],
                "decimal": [.decimal(try InventoryDecimal("12.30"))],
                "date": [.date(try InventoryCanonicalDate("2026-09-22"))],
                "date-time": [
                    .dateTime(try InventoryCanonicalDateTime("2026-09-22T04:05:06.123Z"))
                ],
                "url": [.url(try InventoryCanonicalURL("https://example.com/a b"))],
            ])
    }

    @Test("accepted measurements and flags are parsed into canonical primitives")
    func acceptedMeasurementsAndFlagsAreParsed() throws {
        let fields = [
            InventoryPrefillTestSupport.field(
                id: "measurement", kind: .measurement, fixedUnit: "kg"),
            InventoryPrefillTestSupport.field(id: "boolean", kind: .boolean),
        ]
        let raw: [String: InventoryPrefillRawValue] = [
            "measurement": .text("48.000"),
            "boolean": .flag(false),
        ]

        #expect(
            InventoryPrefillValidator.validate(raw, fields: fields) == [
                "measurement": [
                    .measurement(amount: try InventoryDecimal("48.000"), unit: "kg")
                ],
                "boolean": [.boolean(false)],
            ])
    }

    @Test("accepted choices and many values are parsed into canonical primitives")
    func acceptedChoicesAndManyValuesAreParsed() {
        let active = InventoryPrefillTestSupport.option(id: "active", label: "Active")
        let fields = [
            InventoryPrefillTestSupport.field(
                id: "enumeration", kind: .enumeration, enumOptions: [active]),
            InventoryPrefillTestSupport.field(id: "many", cardinality: .many),
        ]
        let raw: [String: InventoryPrefillRawValue] = [
            "enumeration": .text("Active"),
            "many": .texts(["first", "second"]),
        ]

        #expect(
            InventoryPrefillValidator.validate(raw, fields: fields) == [
                "enumeration": [.enumeration(optionId: "active")],
                "many": [.string("first"), .string("second")],
            ])
    }

    @Test("a single value can be supplied to a many-valued field")
    func oneTextForMany() {
        let field = InventoryPrefillTestSupport.field(id: "many", cardinality: .many)

        #expect(
            InventoryPrefillValidator.validate(["many": .text("one")], fields: [field])
                == ["many": [.string("one")]])
    }
}
