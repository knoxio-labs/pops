import AppCore
import Foundation
import Testing

@testable import InventoryReplica

@Suite("Local-first store: photos")
internal struct LocalFirstStorePhotoTests {
    private static let sha256 = PhotoFixture.sha256

    @Test("uploadPhoto stages on the phone without the network, and photo answers from it")
    func uploadStagesAndPhotoReadsLocally() async throws {
        let replica = try Fixture.downloaded(items: [Fixture.item("mug", revision: 2)])
        let transport = FakeSyncTransport(FakeSyncTransport.Script())
        let store = LocalFirstInventoryStore(replica: replica, transport: transport)

        let result = try await store.uploadPhoto(
            sha256: Self.sha256, data: PhotoFixture.bytes, contentType: .jpeg)

        #expect(result == InventoryMediaUploadResult(sha256: Self.sha256, alreadyStored: false))
        #expect(transport.calls.uploaded.isEmpty)
        var uploads = store.observe(.photoUploads).makeAsyncIterator()
        #expect(await uploads.next() == [Self.sha256: .waiting])
        #expect(try await store.photo(Self.sha256, variant: .thumb) == PhotoFixture.bytes)
        #expect(transport.calls.fetched.isEmpty)
    }

    @Test("a photo this phone never staged is fetched from the server")
    func unstagedPhotoIsFetched() async throws {
        let transport = FakeSyncTransport(FakeSyncTransport.Script())
        transport.update { $0.fetch = { _, _ in Data("from the server".utf8) } }
        let store = LocalFirstInventoryStore(replica: try InventoryReplica(), transport: transport)

        #expect(try await store.photo(Self.sha256, variant: .thumb) == Data("from the server".utf8))
        #expect(transport.calls.fetched == [Self.sha256])
    }
}
