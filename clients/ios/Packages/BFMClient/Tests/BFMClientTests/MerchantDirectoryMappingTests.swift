import AppCore
import Foundation
import Testing

@testable import BFMClient

@Suite("BFMMerchantDirectoryRepository mapping")
internal struct MerchantDirectoryMappingTests {
    @Test("search maps a well-formed page of candidates")
    func mapsSearchResults() async throws {
        let repository = try BFMMerchantDirectoryRepository.stubbed(
            StubTransport(
                status: .ok,
                json: """
                    {"data":[{"id":"ent-1","name":"Bunnings Warehouse"},{"id":"ent-2","name":"Bunnings Airport West"}]}
                    """
            )
        )

        let results = try await repository.search("bunnings")
        #expect(
            results == [
                MerchantDirectoryEntry(id: "ent-1", name: "Bunnings Warehouse"),
                MerchantDirectoryEntry(id: "ent-2", name: "Bunnings Airport West"),
            ])
    }

    @Test("search answers an empty array rather than throwing when nothing matches")
    func mapsAnEmptySearch() async throws {
        let repository = try BFMMerchantDirectoryRepository.stubbed(
            StubTransport(status: .ok, json: #"{"data":[]}"#)
        )

        #expect(try await repository.search("nothing-like-this").isEmpty)
    }

    @Test("get maps a well-formed merchant")
    func mapsGet() async throws {
        let repository = try BFMMerchantDirectoryRepository.stubbed(
            StubTransport(status: .ok, json: #"{"id":"ent-1","name":"Acme"}"#)
        )

        let entry = try await repository.get("ent-1")
        #expect(entry == MerchantDirectoryEntry(id: "ent-1", name: "Acme"))
    }

    @Test("get maps a 404 to nil rather than throwing")
    func mapsGetNotFound() async throws {
        let repository = try BFMMerchantDirectoryRepository.stubbed(
            StubTransport(
                status: .notFound,
                json:
                    #"{"code":"not_found","pillar":"contacts","retryable":false,"message":"gone"}"#
            )
        )

        #expect(try await repository.get("unknown") == nil)
    }

    @Test("create maps the new merchant")
    func mapsCreate() async throws {
        let repository = try BFMMerchantDirectoryRepository.stubbed(
            StubTransport(status: .ok, json: #"{"id":"ent-2","name":"New Merchant"}"#)
        )

        let entry = try await repository.create(name: "New Merchant")
        #expect(entry == MerchantDirectoryEntry(id: "ent-2", name: "New Merchant"))
    }

    @Test("addresses maps a well-formed list")
    func mapsAddresses() async throws {
        let repository = try BFMMerchantDirectoryRepository.stubbed(
            StubTransport(
                status: .ok,
                json: #"{"data":[{"id":"addr-1","value":"12 Example St, Sydney"}]}"#
            )
        )

        let addresses = try await repository.addresses(forMerchant: "ent-1")
        #expect(addresses == [MerchantAddressEntry(id: "addr-1", value: "12 Example St, Sydney")])
    }

    @Test("createAddress maps the new address")
    func mapsCreateAddress() async throws {
        let repository = try BFMMerchantDirectoryRepository.stubbed(
            StubTransport(status: .ok, json: #"{"id":"addr-2","value":"99 New St, Melbourne"}"#)
        )

        let address = try await repository.createAddress(
            forMerchant: "ent-1", value: "99 New St, Melbourne")
        #expect(address == MerchantAddressEntry(id: "addr-2", value: "99 New St, Melbourne"))
    }

    @Test("a malformed response throws a RepositoryError, not a crash")
    func malformedResponseIsARepositoryError() async throws {
        let repository = try BFMMerchantDirectoryRepository.stubbed(
            StubTransport(status: .ok, json: #"{"nope":true}"#)
        )

        await #expect(throws: RepositoryError.self) {
            _ = try await repository.search("anything")
        }
    }
}

extension BFMMerchantDirectoryRepository {
    internal static func stubbed(_ transport: StubTransport) throws
        -> BFMMerchantDirectoryRepository
    {
        BFMMerchantDirectoryRepository(
            client: BFMHTTPClient(
                baseURL: try #require(URL(string: "https://bfm.example")),
                transport: transport
            )
        )
    }
}
