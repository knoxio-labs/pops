import AppCore
import Foundation
import Testing

@testable import InventoryReplica

@Suite("Photos: staging on the phone")
internal struct PhotoStagingTests {
    private static let sha256 = PhotoFixture.sha256

    @Test("staging writes the bytes and records them waiting and pinned")
    func stagingWritesAndPins() throws {
        let files = InMemoryMediaFiles()
        let replica = try PhotoFixture.staged(files: files)

        #expect(try files.read(named: "\(Self.sha256)-full") == PhotoFixture.bytes)
        #expect(try replica.stagedPhoto(Self.sha256) == PhotoFixture.bytes)
        #expect(try replica.photoUploads == [Self.sha256: .waiting])
        #expect(try replica.isPinned(Self.sha256) == true)
    }

    @Test("staging the same bytes again answers already held and keeps one row")
    func restagingIsIdempotent() throws {
        let replica = try PhotoFixture.staged()

        let again = try replica.stagePhoto(
            sha256: Self.sha256, data: PhotoFixture.bytes, contentType: .jpeg)

        #expect(again == InventoryMediaUploadResult(sha256: Self.sha256, alreadyStored: true))
        #expect(try replica.photoUploads.count == 1)
    }

    @Test("bytes that do not hash to the name given are refused and nothing is staged")
    func hashMismatchRefused() throws {
        let replica = try InventoryReplica()
        let other = String(repeating: "c", count: 64)

        #expect(throws: InventoryCommandError.self) {
            try replica.stagePhoto(sha256: other, data: PhotoFixture.bytes, contentType: .jpeg)
        }
        #expect(try replica.photoUploads.isEmpty)
        #expect(try replica.stagedPhoto(other) == nil)
    }

    @Test("under 200 MB free, staging raises storage full and writes nothing")
    func storageFull() throws {
        let files = InMemoryMediaFiles()
        let replica = try InventoryReplica(
            mediaFiles: files, freeBytes: { ReplicaStorage.minimumFreeBytes - 1 })

        #expect(throws: InventoryStorageError.full) {
            try replica.stagePhoto(
                sha256: Self.sha256, data: PhotoFixture.bytes, contentType: .jpeg)
        }
        #expect(try files.read(named: "\(Self.sha256)-full") == nil)
        #expect(try replica.photoUploads.isEmpty)
    }

    @Test("exactly 200 MB free still stages")
    func storageBoundary() throws {
        let replica = try InventoryReplica(freeBytes: { ReplicaStorage.minimumFreeBytes })

        _ = try replica.stagePhoto(
            sha256: Self.sha256, data: PhotoFixture.bytes, contentType: .jpeg)

        #expect(try replica.photoUploads == [Self.sha256: .waiting])
    }

    @Test("an attach of a photo not yet uploaded is logged at once and held from the drain")
    func attachIsLocalAndHeld() throws {
        let replica = try PhotoFixture.staged()

        try PhotoFixture.attach("m1", on: replica)

        #expect(try replica.read(.item(id: "mug"))?.photos.map(\.sha256) == [Self.sha256])
        #expect(try replica.ledger.waiting.map(\.id) == ["m1"])
        #expect(try replica.outboundMutations().isEmpty)
    }

    @Test("an attach of bytes this phone never staged is sent as it is")
    func unstagedAttachIsSent() throws {
        let replica = try MutationLogPerformTests.replica()
        _ = try replica.perform(
            .attachPhoto(itemId: "mug", sha256: Self.sha256, position: 0), mutationId: "m1",
            clientTime: PhotoFixture.time)

        #expect(try replica.outboundMutations().map(\.mutationId) == ["m1"])
    }

    @Test("a photo taken offline survives a relaunch, then uploads before its attach")
    func survivesRelaunch() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(
            "PhotoStagingTests-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let open = {
            try InventoryReplica(
                onDiskAt: directory, now: { Fixture.created }, freeBytes: { _ in .max })
        }
        do {
            let replica = try open()
            try replica.apply(Fixture.snapshot(items: [Fixture.item("mug", revision: 2)]))
            _ = try replica.stagePhoto(
                sha256: Self.sha256, data: PhotoFixture.bytes, contentType: .jpeg)
            try PhotoFixture.attach("m1", on: replica)
        }

        let reopened = try open()
        #expect(try reopened.stagedPhoto(Self.sha256) == PhotoFixture.bytes)
        #expect(try reopened.read(.item(id: "mug"))?.photos.map(\.sha256) == [Self.sha256])
        let order = CallOrder()
        let harness = DrainHarness(replica: reopened, submit: order.submitting())
        harness.transport.update { $0.upload = order.uploading() }

        #expect(await harness.drain.drainNow() == .drained)

        #expect(order.all == ["upload \(Self.sha256.prefix(6))", "submit m1"])
        #expect(try reopened.photoUploads == [Self.sha256: .uploaded])
        #expect(try reopened.isPinned(Self.sha256) == false)
    }
}
