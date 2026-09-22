import AppCore

internal struct PurchaseCaptureMerchantDirectory {
    private let repository: any MerchantDirectoryRepository

    internal init(repository: any MerchantDirectoryRepository) {
        self.repository = repository
    }

    internal func search(_ query: String) async -> [ReceiptMerchantChoice] {
        do {
            return try await repository.search(query).map(Self.choice)
        } catch {
            return []
        }
    }

    internal func merchant(_ id: String) async -> ReceiptMerchantChoice? {
        do {
            return try await repository.get(id).map(Self.choice)
        } catch {
            return nil
        }
    }

    internal func addresses(for merchantID: String) async -> [ReceiptAddressChoice] {
        do {
            return try await repository.addresses(forMerchant: merchantID).map(Self.choice)
        } catch {
            return []
        }
    }

    internal func address(
        merchantID: String,
        addressID: String
    ) async -> ReceiptAddressChoice? {
        await addresses(for: merchantID).first { $0.id == addressID }
    }

    private static func choice(_ entry: MerchantDirectoryEntry) -> ReceiptMerchantChoice {
        ReceiptMerchantChoice(id: entry.id, name: entry.name)
    }

    private static func choice(_ entry: MerchantAddressEntry) -> ReceiptAddressChoice {
        ReceiptAddressChoice(id: entry.id, value: entry.value)
    }
}
