#if canImport(FoundationModels)
    import AppCore
    import FoundationModels

    @available(iOS 26.4, macOS 26.4, *)
    internal struct FoundationModelsPrefillGenerator: InventoryPrefillGenerator {
        internal static let instructions =
            "Fill a property only when the facts state it. Copy numbers and names verbatim. "
            + "Leave every other property empty."

        internal var tokenBudget: Int {
            get async {
                let model = SystemLanguageModel.default
                let instructionCost =
                    (try? await model.tokenCount(for: Instructions(Self.instructions))) ?? 0
                return model.contextSize - instructionCost - 1_024
            }
        }

        internal func tokenCount(_ text: String) async -> Int {
            (try? await SystemLanguageModel.default.tokenCount(for: text)) ?? 0
        }

        internal func generate(
            source: InventoryPrefillSource, fields: [InventoryCatalogueField]
        ) async throws -> [String: InventoryPrefillRawValue] {
            let built = InventoryPrefillSchemaBuilder.make(fields: fields)
            let schema = try GenerationSchema(root: built.root, dependencies: [])
            let session = LanguageModelSession(model: .default, instructions: Self.instructions)
            let response = try await session.respond(
                to: source.renderedFacts, schema: schema, includeSchemaInPrompt: true)
            let propertyNamesByFieldID = Dictionary(
                uniqueKeysWithValues: built.fieldIDsByPropertyName.map { ($1, $0) })

            return try fields.reduce(into: [String: InventoryPrefillRawValue]()) { result, field in
                guard let propertyName = propertyNamesByFieldID[field.id],
                    let value = try rawValue(
                        for: field, propertyName: propertyName, content: response.content)
                else { return }
                result[field.id] = value
            }
        }

        private func rawValue(
            for field: InventoryCatalogueField, propertyName: String, content: GeneratedContent
        ) throws -> InventoryPrefillRawValue? {
            switch field.kind {
            case .boolean:
                if field.cardinality == .many {
                    do {
                        return .flags(try content.value([Bool].self, forProperty: propertyName))
                    } catch {
                        return nil
                    }
                }
                do {
                    return .flag(try content.value(Bool.self, forProperty: propertyName))
                } catch {
                    return nil
                }
            case .shortText, .longText, .integer, .decimal, .enumeration, .measurement, .date,
                .dateTime, .url, .reference:
                if field.cardinality == .many {
                    do {
                        return .texts(try content.value([String].self, forProperty: propertyName))
                    } catch {
                        return nil
                    }
                }
                do {
                    return .text(try content.value(String.self, forProperty: propertyName))
                } catch {
                    return nil
                }
            }
        }
    }
#endif
