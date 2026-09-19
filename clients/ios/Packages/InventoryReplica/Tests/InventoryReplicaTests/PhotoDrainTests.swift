import AppCore
import Foundation
import Testing

@testable import InventoryReplica

@Suite("Photos: the drain's uploads", .timeLimit(.minutes(1)))
internal struct PhotoDrainTests {
    private static let sha256 = PhotoFixture.sha256
    private static let upload = "upload \(PhotoFixture.sha256.prefix(6))"

    private static func harness(
        _ replica: InventoryReplica, order: CallOrder,
        submit: @escaping FakeSyncTransport.SubmitHandler = DrainFixture.answering([:]),
        upload: FakeSyncTransport.UploadHandler? = nil
    ) -> DrainHarness {
        let harness = DrainHarness(replica: replica, submit: order.submitting(submit))
        harness.transport.update { $0.upload = upload ?? order.uploading() }
        return harness
    }

    @Test("bytes the server already stored count as uploaded, and the attach goes")
    func alreadyStoredIsSuccess() async throws {
        let replica = try PhotoFixture.staged()
        try PhotoFixture.attach("m1", on: replica)
        let order = CallOrder()
        let harness = Self.harness(
            replica, order: order,
            upload: order.uploading { InventoryMediaUploadResult(sha256: $0, alreadyStored: true) })

        #expect(await harness.drain.drainNow() == .drained)

        #expect(order.all == [Self.upload, "submit m1"])
        #expect(try replica.photoUploads == [Self.sha256: .uploaded])
    }

    @Test("a staged photo uploads even before anything attaches it, and is then unpinned")
    func uploadsEagerly() async throws {
        let replica = try PhotoFixture.staged()
        let order = CallOrder()
        let harness = Self.harness(replica, order: order)

        #expect(await harness.drain.drainNow() == .drained)

        #expect(order.all == [Self.upload])
        #expect(try replica.isPinned(Self.sha256) == false)
    }

    @Test("uploaded bytes stay pinned until the attach waiting on them is applied")
    func pinnedUntilAttachApplied() async throws {
        let replica = try PhotoFixture.staged()
        try PhotoFixture.attach("m1", on: replica)
        let order = CallOrder()
        let harness = Self.harness(
            replica, order: order,
            submit: DrainFixture.answering(["m1": .deferred(waitingOn: "m0")]))

        #expect(await harness.drain.drainNow() == .retryLater)
        #expect(try replica.photoUploads == [Self.sha256: .uploaded])
        #expect(try replica.isPinned(Self.sha256) == true)

        harness.transport.update { $0.submit = order.submitting() }
        #expect(await harness.drain.drainNow() == .drained)
        #expect(try replica.isPinned(Self.sha256) == false)
    }

    @Test("an upload that never arrives sends no attach, waits again, and retries later")
    func transportFailureHoldsTheAttach() async throws {
        let replica = try PhotoFixture.staged()
        try PhotoFixture.attach("m1", on: replica)
        let order = CallOrder()
        let harness = Self.harness(
            replica, order: order,
            upload: order.uploading { _ in throw RepositoryError.transport("offline") })

        #expect(await harness.drain.drainNow() == .retryLater)

        #expect(order.all == [Self.upload])
        #expect(try replica.photoUploads == [Self.sha256: .waiting])
        #expect(try replica.ledger.repairs.isEmpty)
        #expect(try replica.isPinned(Self.sha256) == true)
    }

    @Test("401 on an upload blocks the pass rather than retrying it")
    func unauthorisedBlocks() async throws {
        let replica = try PhotoFixture.staged()
        let order = CallOrder()
        let harness = Self.harness(
            replica, order: order,
            upload: order.uploading { _ in throw RepositoryError.unauthorized })

        #expect(await harness.drain.drainNow() == .blocked)
        #expect(try replica.photoUploads == [Self.sha256: .waiting])
    }

    @Test("413 fails the photo and opens the failed photo repair; the attach is never sent")
    func tooLargeOpensPhotoFailed() async throws {
        for (refusal, failure) in [
            (InventorySyncTransportError.mediaTooLarge, InventoryPhotoUploadFailure.tooLarge),
            (.mediaUnsupported, .unsupported),
        ] {
            let replica = try PhotoFixture.staged()
            try PhotoFixture.attach("m1", on: replica)
            let order = CallOrder()
            let harness = Self.harness(
                replica, order: order, upload: order.uploading { _ in throw refusal })

            #expect(await harness.drain.drainNow() == .drained)

            #expect(order.all == [Self.upload])
            #expect(try replica.photoUploads == [Self.sha256: .failed(failure)])
            let repairs = try replica.ledger.repairs
            #expect(repairs.map(\.id) == ["m1"])
            #expect(repairs.map(\.kind) == [.photoFailed])
            #expect(try replica.read(.item(id: "mug"))?.photos.isEmpty == true)
            #expect(try replica.isPinned(Self.sha256) == true)
        }
    }

    @Test("an attach logged after its photo failed opens the repair on the next pass")
    func attachAfterFailure() async throws {
        let replica = try PhotoFixture.staged()
        let order = CallOrder()
        let harness = Self.harness(
            replica, order: order,
            upload: order.uploading { _ in throw InventorySyncTransportError.mediaTooLarge })
        #expect(await harness.drain.drainNow() == .drained)
        try PhotoFixture.attach("m1", on: replica)

        #expect(await harness.drain.drainNow() == .drained)

        #expect(try replica.ledger.repairs.map(\.kind) == [.photoFailed])
        #expect(order.all == [Self.upload])
    }

    @Test("staged bytes gone from the phone fail the photo without an upload")
    func missingBytesFail() async throws {
        let files = InMemoryMediaFiles()
        let replica = try PhotoFixture.staged(files: files)
        try PhotoFixture.attach("m1", on: replica)
        try files.remove(named: "\(Self.sha256)-full")
        let order = CallOrder()
        let harness = Self.harness(replica, order: order)

        #expect(await harness.drain.drainNow() == .drained)

        #expect(order.all.isEmpty)
        #expect(try replica.photoUploads == [Self.sha256: .failed(.bytesMissing)])
        #expect(try replica.ledger.repairs.map(\.kind) == [.photoFailed])
    }

    @Test("media_missing uploads the staged bytes again, then retries the attach under a new id")
    func mediaMissingReuploadsThenRetries() async throws {
        let replica = try PhotoFixture.staged()
        try PhotoFixture.attach("m1", on: replica)
        let order = CallOrder()
        let harness = DrainHarness(
            replica: replica, mintMutationId: RepairFixture.minting(["r1"]),
            submit: order.submitting(
                DrainFixture.answering([
                    "m1": .rejected(reason: .mediaMissing, message: "upload first")
                ])))
        harness.transport.update { $0.upload = order.uploading() }

        #expect(await harness.drain.drainNow() == .drained)

        #expect(order.all == [Self.upload, "submit m1", Self.upload, "submit r1"])
        #expect(try replica.ledger.repairs.isEmpty)
        #expect(try replica.logEntry("r1")?.state == .applied)
        #expect(try replica.isPinned(Self.sha256) == false)
    }

    @Test("a second media_missing opens the failed photo repair instead of looping")
    func mediaMissingTwiceOpensRepair() async throws {
        let replica = try PhotoFixture.staged()
        try PhotoFixture.attach("m1", on: replica)
        let order = CallOrder()
        let harness = DrainHarness(
            replica: replica, mintMutationId: RepairFixture.minting(["r1"]),
            submit: order.submitting(
                SyncFixture.answering(.rejected(reason: .mediaMissing, message: "upload first"))))
        harness.transport.update { $0.upload = order.uploading() }

        #expect(await harness.drain.drainNow() == .drained)

        #expect(order.all == [Self.upload, "submit m1", Self.upload, "submit r1"])
        #expect(try replica.ledger.repairs.map(\.id) == ["r1"])
        #expect(try replica.ledger.repairs.map(\.kind) == [.photoFailed])
    }

    @Test("Retry on a failed photo uploads the bytes again before the attach is re-sent")
    func retryReuploadsFirst() async throws {
        let replica = try PhotoFixture.staged()
        try PhotoFixture.attach("m1", on: replica)
        let order = CallOrder()
        let harness = Self.harness(
            replica, order: order,
            upload: order.uploading { _ in throw InventorySyncTransportError.mediaTooLarge })
        #expect(await harness.drain.drainNow() == .drained)

        try replica.resolve("m1", with: .keepMine(), minting: ["k1"])
        #expect(try replica.photoUploads == [Self.sha256: .waiting])
        #expect(try replica.outboundMutations().isEmpty)
        harness.transport.update { $0.upload = order.uploading() }

        #expect(await harness.drain.drainNow() == .drained)

        #expect(order.all == [Self.upload, Self.upload, "submit k1"])
        #expect(try replica.ledger.resolved.map(\.outcome) == ["Photo retried"])
    }

    @Test("Remove on a failed photo drops the attach and unpins the bytes")
    func removeUnpins() async throws {
        let replica = try PhotoFixture.staged()
        try PhotoFixture.attach("m1", on: replica)
        let order = CallOrder()
        let harness = Self.harness(
            replica, order: order,
            upload: order.uploading { _ in throw InventorySyncTransportError.mediaTooLarge })
        #expect(await harness.drain.drainNow() == .drained)

        try replica.resolve("m1", with: .discardMine, minting: [])

        #expect(try replica.isPinned(Self.sha256) == false)
        #expect(try replica.outboundMutations().isEmpty)
        #expect(try replica.ledger.resolved.map(\.outcome) == ["Photo removed"])
    }

    @Test("an upload left in flight by a pass that died is sent again")
    func inFlightUploadRequeued() async throws {
        let replica = try PhotoFixture.staged()
        try replica.markUploading(Self.sha256)
        let order = CallOrder()
        let harness = Self.harness(replica, order: order)

        #expect(await harness.drain.drainNow() == .drained)

        #expect(order.all == [Self.upload])
        #expect(try replica.photoUploads == [Self.sha256: .uploaded])
    }
}
