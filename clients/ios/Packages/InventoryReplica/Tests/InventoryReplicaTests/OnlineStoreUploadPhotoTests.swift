import AppCore
import Foundation
import InventoryReplica
import Testing

/// `OnlineInventoryStore.uploadPhoto` (A22): a thin forward onto the
/// transport, over the same shape `photo(_:variant:)` already forwards
/// `fetchMedia` through.
@Suite("Online store photo upload")
internal struct OnlineStoreUploadPhotoTests {
    private static func harness() throws -> OnlineHarness {
        let replica = try InventoryReplica()
        let transport = FakeSyncTransport()
        let store = OnlineInventoryStore(replica: replica, transport: transport)
        return OnlineHarness(store: store, transport: transport, replica: replica)
    }

    @Test("a fresh upload carries the bytes and content type to the transport")
    func forwardsToTransport() async throws {
        let harness = try Self.harness()
        let sha = String(repeating: "b", count: 64)
        let bytes = Data("a photo".utf8)

        let result = try await harness.store.uploadPhoto(
            sha256: sha, data: bytes, contentType: .jpeg)

        #expect(result == InventoryMediaUploadResult(sha256: sha, alreadyStored: false))
        #expect(harness.transport.calls.uploaded == [sha])
    }

    @Test("a transport failure surfaces to the caller rather than being swallowed")
    func propagatesFailure() async throws {
        let harness = try Self.harness()
        harness.transport.update {
            $0.upload = { _, _, _ in
                throw RepositoryError.transport("mobileInventory.putMedia: payload too large")
            }
        }

        await #expect(
            throws: RepositoryError.transport("mobileInventory.putMedia: payload too large")
        ) {
            _ = try await harness.store.uploadPhoto(
                sha256: String(repeating: "c", count: 64), data: Data(), contentType: .jpeg)
        }
    }
}

/// `OnlineInventoryStore.photo(_:variant:)`'s small in-memory cache: a
/// second read of the same hash and variant never asks the transport again.
@Suite("Online store photo cache")
internal struct OnlineStorePhotoCacheTests {
    private static func harness() throws -> OnlineHarness {
        let replica = try InventoryReplica()
        let transport = FakeSyncTransport()
        let store = OnlineInventoryStore(replica: replica, transport: transport)
        return OnlineHarness(store: store, transport: transport, replica: replica)
    }

    private static let cachedSha = String(repeating: "1", count: 64)

    @Test("a second read of the same hash and variant is served from the cache")
    func cachesByHashAndVariant() async throws {
        let harness = try Self.harness()
        harness.transport.update { $0.fetch = { _, _ in Data("thumb bytes".utf8) } }

        let first = try await harness.store.photo(Self.cachedSha, variant: .thumb)
        let second = try await harness.store.photo(Self.cachedSha, variant: .thumb)

        #expect(first == Data("thumb bytes".utf8))
        #expect(second == first)
        #expect(harness.transport.calls.fetched == [Self.cachedSha])
    }

    @Test("the same hash under a different variant is fetched again")
    func variantIsPartOfTheKey() async throws {
        let harness = try Self.harness()
        harness.transport.update {
            $0.fetch = { sha256, variant in Data("\(sha256)-\(variant)".utf8) }
        }

        _ = try await harness.store.photo(Self.cachedSha, variant: .thumb)
        _ = try await harness.store.photo(Self.cachedSha, variant: .full)

        #expect(harness.transport.calls.fetched == [Self.cachedSha, Self.cachedSha])
    }
}
