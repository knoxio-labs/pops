import AppCore
import Foundation
import GRDB
import Testing

@testable import InventoryReplica

@Suite("Media cache budget")
internal struct MediaCacheTests {
    private static func sha(_ tag: Character) -> String { String(repeating: tag, count: 64) }

    private static func bytes(_ count: Int) -> Data { Data(repeating: 7, count: count) }

    private static func replica(
        budget: Int64, files: InMemoryMediaFiles = InMemoryMediaFiles(), clock: TestClock
    ) throws -> InventoryReplica {
        try InventoryReplica(
            now: { clock.now }, mediaFiles: files, mediaBudgetBytes: budget)
    }

    private static func cache(
        _ tag: Character, _ variant: InventoryPhotoVariant, bytes count: Int,
        on replica: InventoryReplica, clock: TestClock
    ) throws {
        clock.now = clock.now.addingTimeInterval(1)
        try replica.cachePhoto(Self.bytes(count), sha256: sha(tag), variant: variant)
    }

    @Test("over budget, the least recently used full-size variants go first")
    func evictsLeastRecentlyUsed() throws {
        let clock = TestClock(Fixture.created)
        let files = InMemoryMediaFiles()
        let replica = try Self.replica(budget: 300, files: files, clock: clock)
        try Self.cache("a", .full, bytes: 100, on: replica, clock: clock)
        try Self.cache("b", .medium, bytes: 100, on: replica, clock: clock)
        try Self.cache("c", .full, bytes: 100, on: replica, clock: clock)
        clock.now = clock.now.addingTimeInterval(1)
        #expect(try replica.cachedPhoto(Self.sha("a"), variant: .full) != nil)

        try Self.cache("d", .full, bytes: 100, on: replica, clock: clock)

        #expect(try replica.cachedPhoto(Self.sha("b"), variant: .medium) == nil)
        #expect(try files.read(named: "\(Self.sha("b"))-medium") == nil)
        for tag: Character in ["a", "c", "d"] {
            #expect(try replica.cachedPhoto(Self.sha(tag), variant: .full) != nil)
        }
    }

    @Test("exactly at the budget nothing is evicted")
    func atBudgetKeepsAll() throws {
        let clock = TestClock(Fixture.created)
        let replica = try Self.replica(budget: 200, clock: clock)
        try Self.cache("a", .full, bytes: 100, on: replica, clock: clock)
        try Self.cache("b", .full, bytes: 100, on: replica, clock: clock)

        #expect(try replica.cachedPhoto(Self.sha("a"), variant: .full) != nil)
        #expect(try replica.cachedPhoto(Self.sha("b"), variant: .full) != nil)
    }

    @Test("one byte over evicts only as much as it takes to fit")
    func evictsOnlyWhatItMust() throws {
        let clock = TestClock(Fixture.created)
        let replica = try Self.replica(budget: 200, clock: clock)
        try Self.cache("a", .full, bytes: 100, on: replica, clock: clock)
        try Self.cache("b", .full, bytes: 100, on: replica, clock: clock)
        try Self.cache("c", .full, bytes: 1, on: replica, clock: clock)

        #expect(try replica.cachedPhoto(Self.sha("a"), variant: .full) == nil)
        #expect(try replica.cachedPhoto(Self.sha("b"), variant: .full) != nil)
        #expect(try replica.cachedPhoto(Self.sha("c"), variant: .full) != nil)
    }

    @Test("thumbnails are kept, and do not count towards the budget")
    func thumbnailsKept() throws {
        let clock = TestClock(Fixture.created)
        let replica = try Self.replica(budget: 100, clock: clock)
        try Self.cache("a", .thumb, bytes: 1_000, on: replica, clock: clock)
        try Self.cache("b", .full, bytes: 100, on: replica, clock: clock)
        try Self.cache("c", .thumb, bytes: 1_000, on: replica, clock: clock)

        #expect(try replica.cachedPhoto(Self.sha("a"), variant: .thumb) != nil)
        #expect(try replica.cachedPhoto(Self.sha("b"), variant: .full) != nil)
        #expect(try replica.cachedPhoto(Self.sha("c"), variant: .thumb) != nil)
    }

    @Test("a pinned staged photo survives eviction, however old, and the rest is evicted around it")
    func pinnedSurvives() throws {
        let clock = TestClock(Fixture.created)
        let files = InMemoryMediaFiles()
        let replica = try Self.replica(budget: 60, files: files, clock: clock)
        _ = try replica.stagePhoto(
            sha256: PhotoFixture.sha256, data: PhotoFixture.bytes, contentType: .jpeg)
        try Self.cache("a", .full, bytes: 50, on: replica, clock: clock)
        try Self.cache("b", .full, bytes: 50, on: replica, clock: clock)

        #expect(try replica.stagedPhoto(PhotoFixture.sha256) == PhotoFixture.bytes)
        #expect(try replica.isPinned(PhotoFixture.sha256))
        #expect(try replica.cachedPhoto(Self.sha("a"), variant: .full) == nil)
        #expect(try replica.cachedPhoto(Self.sha("b"), variant: .full) == nil)
    }

    @Test("once uploaded and unpinned, a staged photo is evicted like any other")
    func unpinnedStagedIsEvictable() throws {
        let clock = TestClock(Fixture.created)
        let replica = try Self.replica(budget: 1, clock: clock)
        _ = try replica.stagePhoto(
            sha256: PhotoFixture.sha256, data: PhotoFixture.bytes, contentType: .jpeg)
        #expect(try replica.stagedPhoto(PhotoFixture.sha256) == PhotoFixture.bytes)

        try replica.markUploaded(PhotoFixture.sha256)
        try replica.evictOverBudget()

        #expect(try replica.stagedPhoto(PhotoFixture.sha256) == nil)
        #expect(try replica.photoUploads.isEmpty)
    }

    @Test("a staged photo answers any variant until that variant is cached")
    func stagedAnswersEveryVariant() throws {
        let replica = try PhotoFixture.staged()

        #expect(try replica.cachedPhoto(PhotoFixture.sha256, variant: .thumb) == PhotoFixture.bytes)

        try replica.cachePhoto(Data("thumb".utf8), sha256: PhotoFixture.sha256, variant: .thumb)
        #expect(try replica.cachedPhoto(PhotoFixture.sha256, variant: .thumb) == Data("thumb".utf8))
        #expect(try replica.photoUploads == [PhotoFixture.sha256: .waiting])
    }

    @Test("a cached full copy from the server does not stand in for a thumbnail")
    func cachedFullIsNotAThumbnail() throws {
        let clock = TestClock(Fixture.created)
        let replica = try Self.replica(budget: 1_000, clock: clock)
        try Self.cache("a", .full, bytes: 10, on: replica, clock: clock)

        #expect(try replica.cachedPhoto(Self.sha("a"), variant: .thumb) == nil)
    }

    @Test("a row whose file has gone is forgotten and the variant fetched again")
    func missingFileRefetches() async throws {
        let files = InMemoryMediaFiles()
        let replica = try InventoryReplica(mediaFiles: files)
        let transport = FakeSyncTransport()
        transport.update { $0.fetch = { _, _ in Data("thumb".utf8) } }
        let store = OnlineInventoryStore(replica: replica, transport: transport)
        _ = try await store.photo(Self.sha("a"), variant: .thumb)
        try files.remove(named: "\(Self.sha("a"))-thumb")

        #expect(try await store.photo(Self.sha("a"), variant: .thumb) == Data("thumb".utf8))

        #expect(transport.calls.fetched == [Self.sha("a"), Self.sha("a")])
    }

    @Test("a cached variant survives a relaunch and is not fetched again")
    func survivesRelaunch() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(
            "MediaCacheTests-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let open = { try InventoryReplica(onDiskAt: directory, freeBytes: { _ in .max }) }
        let transport = FakeSyncTransport()
        transport.update { $0.fetch = { _, _ in Data("medium".utf8) } }
        do {
            let store = OnlineInventoryStore(replica: try open(), transport: transport)
            _ = try await store.photo(Self.sha("a"), variant: .medium)
        }

        let store = OnlineInventoryStore(replica: try open(), transport: transport)

        #expect(try await store.photo(Self.sha("a"), variant: .medium) == Data("medium".utf8))
        #expect(transport.calls.fetched == [Self.sha("a")])
    }
}
