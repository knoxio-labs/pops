#if canImport(FoundationModels)
    import AppCore
    import FoundationModels
    import Testing

    @testable import FeatureInventory

    @Suite("Inventory prefill schema")
    internal struct InventoryPrefillSchemaTests {
        @Test("property names are sanitised, deduplicated, and round-trip to IDs")
        func propertyNames() {
            guard #available(iOS 26.4, macOS 26.4, *) else { return }
            let first = InventoryPrefillTestSupport.field(id: "first", key: "serial-number")
            let second = InventoryPrefillTestSupport.field(id: "second", key: "serial number")
            let result = InventoryPrefillSchemaBuilder.make(fields: [first, second])

            #expect(result.fieldIDsByPropertyName["serial_number"] == "first")
            #expect(result.fieldIDsByPropertyName["serial_number_2"] == "second")
        }

        @Test("active enum labels, arrays, booleans, and optional properties build")
        func schemaKinds() throws {
            guard #available(iOS 26.4, macOS 26.4, *) else { return }
            let active = InventoryPrefillTestSupport.option(id: "active", label: "Active")
            let archived = InventoryPrefillTestSupport.option(
                id: "archived", label: "Archived", archivedAt: "2026-09-01")
            let fields = [
                InventoryPrefillTestSupport.field(
                    id: "enum", kind: .enumeration, enumOptions: [active, archived]),
                InventoryPrefillTestSupport.field(id: "many", cardinality: .many),
                InventoryPrefillTestSupport.field(id: "flag", kind: .boolean),
            ]
            let built = InventoryPrefillSchemaBuilder.make(fields: fields)
            let schema = try GenerationSchema(root: built.root, dependencies: [])

            #expect(schema.debugDescription.contains("Active"))
            #expect(!schema.debugDescription.contains("Archived"))
            #expect(schema.debugDescription.contains("\"type\" : \"array\""))
            #expect(schema.debugDescription.contains("\"type\" : \"boolean\""))
        }

        @Test("a schema containing every supported field kind builds")
        func everyKindBuilds() throws {
            guard #available(iOS 26.4, macOS 26.4, *) else { return }
            let option = InventoryPrefillTestSupport.option(id: "yes", label: "Yes")
            let fields: [InventoryCatalogueField] = [
                InventoryPrefillTestSupport.field(id: "short", kind: .shortText),
                InventoryPrefillTestSupport.field(id: "long", kind: .longText),
                InventoryPrefillTestSupport.field(id: "integer", kind: .integer),
                InventoryPrefillTestSupport.field(id: "decimal", kind: .decimal),
                InventoryPrefillTestSupport.field(id: "boolean", kind: .boolean),
                InventoryPrefillTestSupport.field(
                    id: "enum", kind: .enumeration, enumOptions: [option]),
                InventoryPrefillTestSupport.field(
                    id: "measurement", kind: .measurement, fixedUnit: "kg"),
                InventoryPrefillTestSupport.field(id: "date", kind: .date),
                InventoryPrefillTestSupport.field(id: "date-time", kind: .dateTime),
                InventoryPrefillTestSupport.field(id: "url", kind: .url),
                InventoryPrefillTestSupport.field(id: "reference", kind: .reference),
            ]

            let built = InventoryPrefillSchemaBuilder.make(fields: fields)
            _ = try GenerationSchema(root: built.root, dependencies: [])
        }
    }
#endif
