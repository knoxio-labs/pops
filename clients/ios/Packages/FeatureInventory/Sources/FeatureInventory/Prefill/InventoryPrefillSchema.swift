#if canImport(FoundationModels)
    import AppCore
    import FoundationModels

    @available(iOS 26.4, macOS 26.4, *)
    internal struct InventoryPrefillSchema {
        internal let root: DynamicGenerationSchema
        internal let fieldIDsByPropertyName: [String: String]
    }

    @available(iOS 26.4, macOS 26.4, *)
    internal enum InventoryPrefillSchemaBuilder {
        internal static func make(fields: [InventoryCatalogueField]) -> InventoryPrefillSchema {
            var properties: [DynamicGenerationSchema.Property] = []
            var fieldIDsByPropertyName: [String: String] = [:]
            var usedNames: Set<String> = []

            for field in fields {
                let baseName = sanitized(field.key)
                let propertyName = uniqueName(baseName, usedNames: &usedNames)
                let schema = schema(for: field, propertyName: propertyName)
                properties.append(
                    DynamicGenerationSchema.Property(
                        name: propertyName, description: description(for: field), schema: schema,
                        isOptional: true))
                fieldIDsByPropertyName[propertyName] = field.id
            }

            return InventoryPrefillSchema(
                root: DynamicGenerationSchema(name: "fields", properties: properties),
                fieldIDsByPropertyName: fieldIDsByPropertyName)
        }

        private static func schema(
            for field: InventoryCatalogueField, propertyName: String
        ) -> DynamicGenerationSchema {
            let scalar: DynamicGenerationSchema
            switch field.kind {
            case .boolean:
                scalar = DynamicGenerationSchema(type: Bool.self)
            case .enumeration:
                let labels = field.enumOptions
                    .filter { $0.archivedAt == nil }
                    .sorted { ($0.sortOrder, $0.id) < ($1.sortOrder, $1.id) }
                    .map(\.label)
                scalar = DynamicGenerationSchema(
                    name: "choice_\(sanitized(propertyName))", anyOf: labels)
            case .shortText, .longText, .integer, .decimal, .measurement, .date, .dateTime, .url,
                .reference:
                scalar = DynamicGenerationSchema(type: String.self)
            }

            guard field.cardinality == .many else { return scalar }
            return DynamicGenerationSchema(arrayOf: scalar)
        }

        private static func description(for field: InventoryCatalogueField) -> String {
            guard let help = field.help, !help.isEmpty else { return field.label }
            return "\(field.label) — \(help)"
        }

        private static func sanitized(_ key: String) -> String {
            let scalars = key.unicodeScalars.map { scalar in
                switch scalar.value {
                case 48...57, 65...90, 95, 97...122: return Character(scalar)
                default: return "_"
                }
            }
            return scalars.isEmpty ? "_" : String(scalars)
        }

        private static func uniqueName(
            _ baseName: String, usedNames: inout Set<String>
        ) -> String {
            guard usedNames.contains(baseName) else {
                usedNames.insert(baseName)
                return baseName
            }

            var suffix = 2
            var candidate = "\(baseName)_\(suffix)"
            while usedNames.contains(candidate) {
                suffix += 1
                candidate = "\(baseName)_\(suffix)"
            }
            usedNames.insert(candidate)
            return candidate
        }
    }
#endif
