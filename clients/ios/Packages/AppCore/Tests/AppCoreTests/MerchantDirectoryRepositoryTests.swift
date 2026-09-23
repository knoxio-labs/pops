import AppCore
import AppCoreFakes
import Testing

@Suite("In-memory merchant directory")
internal struct MerchantDirectoryRepositoryTests {
    @Test("search matches case-insensitively and counts calls")
    func searchesCaseInsensitively() async throws {
        let repository = InMemoryMerchantDirectoryRepository(entries: [
            MerchantDirectoryEntry(id: "grocer", name: "Corner Grocer"),
            MerchantDirectoryEntry(id: "cafe", name: "North Cafe"),
        ])

        let matches = try await repository.search("GROCER")

        #expect(matches.map(\.id) == ["grocer"])
        #expect(await repository.searchCallCount == 1)
    }

    @Test("created merchants and addresses become readable and calls are counted")
    func createsReadableRecords() async throws {
        let repository = InMemoryMerchantDirectoryRepository()

        let merchant = try await repository.create(name: "New Merchant")
        let address = try await repository.createAddress(
            forMerchant: merchant.id,
            value: "1 New Street")

        #expect(try await repository.search("new") == [merchant])
        #expect(try await repository.get(merchant.id) == merchant)
        #expect(try await repository.addresses(forMerchant: merchant.id) == [address])
        #expect(await repository.createCallCount == 1)
        #expect(await repository.createAddressCallCount == 1)
    }
}
