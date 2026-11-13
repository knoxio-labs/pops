import AppCore
import Foundation
import Testing

@testable import FeatureTrips

@Suite("Trip Inbox independent source reads")
@MainActor
internal struct TripsInboxModelTests {
    @Test("omitted reader stays unbound and retry without selection does not read")
    internal func unbound() async {
        let unbound = TripsInboxModel(reader: nil)
        #expect(!unbound.isBound)
        unbound.select(7)
        unbound.retry()
        #expect(unbound.state == .unbound)
        #expect(unbound.readTask == nil)
        unbound.clear()
        #expect(unbound.selectedID == nil)
        #expect(unbound.state == .unbound)
        let reader = InboxDeferredReader()
        let bound = TripsInboxModel(reader: reader)
        bound.retry()
        #expect(bound.state == .idle)
        #expect(await reader.requestedTrips.isEmpty)
    }

    @Test("failed reads stay distinct from a genuinely empty loaded workspace")
    internal func failureAndEmpty() async {
        let reader = InboxDeferredReader()
        let model = TripsInboxModel(reader: reader)
        for error in [
            RepositoryError.featureUnavailable, .unauthorized, .unavailable, .contractMismatch,
        ] {
            model.select(7)
            let call = await reader.waitForNext()
            #expect(model.state == .loading)
            await reader.fail(call, error: error)
            await model.readTask?.value
            #expect(model.state == .failed(error))
        }
        model.retry()
        let call = await reader.waitForNext()
        let empty = TripCaptureWorkspace(captures: [])
        await reader.succeed(call, workspace: empty)
        await model.readTask?.value
        #expect(model.state == .loaded(empty))
        #expect(await reader.requestedTrips == [7, 7, 7, 7, 7])
    }

    @Test("foreign owners and duplicate capture identities reject the whole read")
    internal func invalidWorkspace() async {
        let reader = InboxDeferredReader()
        let model = TripsInboxModel(reader: reader)
        for records in [[capture(1), capture(2, tripID: 8)], [capture(1), capture(1)]] {
            model.select(7)
            let call = await reader.waitForNext()
            await reader.succeed(call, workspace: TripCaptureWorkspace(captures: records))
            await model.readTask?.value
            #expect(model.state == .failed(.contractMismatch))
        }
    }

    @Test("A to B to A ignores obsolete success and failure despite ignored cancellation")
    internal func repeatedSelection() async {
        let reader = InboxDeferredReader()
        let model = TripsInboxModel(reader: reader)
        model.select(7)
        let first = model.readTask
        let firstCall = await reader.waitForNext()
        model.select(8)
        let second = model.readTask
        let secondCall = await reader.waitForNext()
        model.select(7)
        let latestCall = await reader.waitForNext()
        let latest = TripCaptureWorkspace(captures: [capture(3)])
        await reader.succeed(latestCall, workspace: latest)
        await model.readTask?.value
        await reader.succeed(firstCall, workspace: TripCaptureWorkspace(captures: [capture(1)]))
        await first?.value
        await reader.fail(secondCall, error: .unauthorized)
        await second?.value
        #expect(model.selectedID == 7)
        #expect(model.state == .loaded(latest))
    }

    @Test("clear fences late reads and a failed refresh cannot retain stale loaded state")
    internal func clearAndRefresh() async {
        let reader = InboxDeferredReader()
        let model = TripsInboxModel(reader: reader)
        model.select(7)
        let first = model.readTask
        let call = await reader.waitForNext()
        model.clear()
        await reader.succeed(call, workspace: TripCaptureWorkspace(captures: [capture(1)]))
        await first?.value
        #expect(model.state == .idle)
        #expect(model.selectedID == nil)
        #expect(model.readTask == nil)
        model.select(8)
        let selectedCall = await reader.waitForNext()
        await reader.succeed(
            selectedCall, workspace: TripCaptureWorkspace(captures: [capture(2, tripID: 8)]))
        await model.readTask?.value
        model.retry()
        let refreshCall = await reader.waitForNext()
        #expect(model.state == .loading)
        await reader.fail(refreshCall, error: .unavailable)
        await model.readTask?.value
        #expect(model.state == .failed(.unavailable))
        #expect(await reader.requestedTrips == [7, 8, 8])
    }

    @Test("active and removed records preserve wire order, originals and attachments exactly")
    internal func sourceProjection() {
        let activeFirst = capture(8)
        let removed = capture(1, removedAt: Date(timeIntervalSince1970: 100))
        let activeLast = capture(2)
        let workspace = TripCaptureWorkspace(captures: [activeFirst, removed, activeLast])
        let projection = TripsInboxProjection(workspace: workspace)
        #expect(projection.active == [activeFirst, activeLast])
        #expect(projection.removed == [removed])
        #expect(projection.active[0].originalText == "  Verbatim original\n")
        #expect(projection.active[0].originalUrl == "https://example.com/source?x=1")
        #expect(
            projection.active[0].attachments == [
                .document(id: 9, taskID: "task-9"), .task("pending"),
            ])
        #expect(projection.active[0].classification == nil)
        #expect(projection.active[0].visitId == nil)
        let onlyRemoved = TripsInboxProjection(workspace: TripCaptureWorkspace(captures: [removed]))
        #expect(onlyRemoved.active.isEmpty)
        #expect(onlyRemoved.removed == [removed])
    }

    private func capture(_ id: Int, tripID: Int = 7, removedAt: Date? = nil) -> TripCaptureRecord {
        TripCaptureRecord(
            id: id, tripId: tripID, originalText: "  Verbatim original\n",
            originalUrl: "https://example.com/source?x=1",
            attachments: [.document(id: 9, taskID: "task-9"), .task("pending")], title: nil,
            notes: "Separate notes", classification: nil, placeId: nil, visitId: nil,
            revision: 1, removedAt: removedAt, createdAt: Date(timeIntervalSince1970: 1),
            updatedAt: Date(timeIntervalSince1970: 2))
    }
}

private actor InboxDeferredReader: TripCapturesReading {
    private(set) var requestedTrips: [Int] = []
    private var pending: [Int: CheckedContinuation<TripCaptureWorkspace, any Error>] = [:]
    private var delivered = 0
    private var waiter: CheckedContinuation<Int, Never>?

    func captures(tripID: Int) async throws -> TripCaptureWorkspace {
        requestedTrips.append(tripID)
        let call = requestedTrips.count
        return try await withCheckedThrowingContinuation { continuation in
            pending[call] = continuation
            if let waiter {
                self.waiter = nil
                delivered = call
                waiter.resume(returning: call)
            }
        }
    }

    func waitForNext() async -> Int {
        if let call = pending.keys.filter({ $0 > delivered }).min() {
            delivered = call
            return call
        }
        return await withCheckedContinuation { waiter = $0 }
    }

    func succeed(_ call: Int, workspace: TripCaptureWorkspace) {
        pending.removeValue(forKey: call)?.resume(returning: workspace)
    }

    func fail(_ call: Int, error: RepositoryError) {
        pending.removeValue(forKey: call)?.resume(throwing: error)
    }
}
