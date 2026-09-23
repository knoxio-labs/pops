import AppCore
import Foundation

/// An in-memory merchant directory for feature tests and previews.
public actor InMemoryMerchantDirectoryRepository: MerchantDirectoryRepository {
    public private(set) var searchCallCount = 0
    public private(set) var createCallCount = 0
    public private(set) var createAddressCallCount = 0

    private var entries: [MerchantDirectoryEntry]
    private var addressesByMerchantID: [String: [MerchantAddressEntry]]

    /// Creates a directory seeded with merchants and their addresses.
    public init(
        entries: [MerchantDirectoryEntry] = [],
        addressesByMerchantID: [String: [MerchantAddressEntry]] = [:]
    ) {
        self.entries = entries
        self.addressesByMerchantID = addressesByMerchantID
    }

    public func search(_ query: String) async throws -> [MerchantDirectoryEntry] {
        searchCallCount += 1
        return entries.filter { $0.name.localizedCaseInsensitiveContains(query) }
    }

    public func get(_ id: String) async throws -> MerchantDirectoryEntry? {
        entries.first { $0.id == id }
    }

    public func create(name: String) async throws -> MerchantDirectoryEntry {
        createCallCount += 1
        let entry = MerchantDirectoryEntry(id: UUID().uuidString, name: name)
        entries.append(entry)
        return entry
    }

    public func addresses(forMerchant id: String) async throws -> [MerchantAddressEntry] {
        addressesByMerchantID[id] ?? []
    }

    public func createAddress(
        forMerchant id: String,
        value: String
    ) async throws -> MerchantAddressEntry {
        createAddressCallCount += 1
        let address = MerchantAddressEntry(id: UUID().uuidString, value: value)
        addressesByMerchantID[id, default: []].append(address)
        return address
    }
}
