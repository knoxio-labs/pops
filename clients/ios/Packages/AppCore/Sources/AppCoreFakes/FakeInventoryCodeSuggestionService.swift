import AppCore

/// A scripted `InventoryCodeSuggestionService`, for a preview or a test that
/// wants a suggestion answered without a paired device.
public struct FakeInventoryCodeSuggestionService: InventoryCodeSuggestionService {
    private let suggest: @Sendable (String, String?, String?) async throws -> [String]

    public init(
        suggest: @escaping @Sendable (String, String?, String?) async throws -> [String]
    ) {
        self.suggest = suggest
    }

    public func suggestCodes(name: String, typeKey: String?, stem: String?) async throws -> [String]
    {
        try await suggest(name, typeKey, stem)
    }
}
