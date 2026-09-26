import AppCore

internal struct PurchaseCaptureMerchantDirectory {
    private let repository: any MerchantDirectoryRepository

    internal init(repository: any MerchantDirectoryRepository) {
        self.repository = repository
    }

    internal func search(_ query: String) async throws -> [ReceiptMerchantChoice] {
        try await repository.search(query).map(Self.choice)
    }

    internal func merchant(_ id: String) async throws -> ReceiptMerchantChoice? {
        try await repository.get(id).map(Self.choice)
    }

    internal func addresses(for merchantID: String) async throws -> [ReceiptAddressChoice] {
        try await repository.addresses(forMerchant: merchantID).map(Self.choice)
    }

    internal func address(
        merchantID: String,
        addressID: String
    ) async throws -> ReceiptAddressChoice? {
        try await addresses(for: merchantID).first { $0.id == addressID }
    }

    private static func choice(_ entry: MerchantDirectoryEntry) -> ReceiptMerchantChoice {
        ReceiptMerchantChoice(id: entry.id, name: entry.name)
    }

    private static func choice(_ entry: MerchantAddressEntry) -> ReceiptAddressChoice {
        ReceiptAddressChoice(id: entry.id, value: entry.value)
    }
}
