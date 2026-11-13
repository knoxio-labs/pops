import AppCore
import Testing

@testable import FeatureTrips

@Suite("Independent canonical route loading")
@MainActor
internal struct TripsRouteModelTests {
    @Test("an omitted route reader remains explicitly unbound")
    internal func unbound() {
        let model = TripsRouteModel(reader: nil)
        model.select(1)
        #expect(model.state == .unbound)
        #expect(model.readTask == nil)
        model.clear()
        #expect(model.selectedID == nil)
        #expect(model.state == .unbound)
    }

    @Test("missing, failed and valid empty routes stay distinct")
    internal func distinctOutcomes() async {
        let reader = DeferredRouteReader()
        let model = TripsRouteModel(reader: reader)
        model.select(1)
        await reader.waitFor(1)
        await reader.complete(1, value: nil)
        await model.readTask?.value
        #expect(model.state == .missing)
        model.retry()
        await reader.waitFor(2)
        await reader.complete(2, error: .featureUnavailable)
        await model.readTask?.value
        #expect(model.state == .failed(.featureUnavailable))
        model.retry()
        await reader.waitFor(3)
        let empty = route(1, revision: 0)
        await reader.complete(3, value: empty)
        await model.readTask?.value
        #expect(model.state == .loaded(empty))
    }

    @Test("a response for another trip fails rather than displaying it")
    internal func wrongTrip() async {
        let reader = DeferredRouteReader()
        let model = TripsRouteModel(reader: reader)
        model.select(1)
        await reader.waitFor(1)
        await reader.complete(1, value: route(2, revision: 4))
        await model.readTask?.value
        #expect(model.state == .failed(.contractMismatch))
    }

    @Test("A to B to A rejects late success and failure from older requests")
    internal func repeatedSelection() async {
        let reader = DeferredRouteReader()
        let model = TripsRouteModel(reader: reader)
        model.select(1)
        let first = model.readTask
        await reader.waitFor(1)
        model.select(2)
        let second = model.readTask
        await reader.waitFor(2)
        model.select(1)
        await reader.waitFor(3)
        let current = route(1, revision: 7)
        await reader.complete(3, value: current)
        await model.readTask?.value
        await reader.complete(1, value: route(1, revision: 3))
        await first?.value
        await reader.complete(2, error: .unauthorized)
        await second?.value
        #expect(model.selectedID == 1)
        #expect(model.state == .loaded(current))
    }

    @Test("clearing selection rejects a late response even when its reader ignores cancellation")
    internal func clearSelection() async {
        let reader = DeferredRouteReader()
        let model = TripsRouteModel(reader: reader)
        model.select(1)
        let pending = model.readTask
        await reader.waitFor(1)
        model.clear()
        await reader.complete(1, value: route(1, revision: 2))
        await pending?.value
        #expect(model.state == .idle)
        #expect(model.selectedID == nil)
    }

    @Test("source failure does not discard a successful canonical route")
    internal func sourceFailure() async throws {
        let snapshot = try TripTestSources.snapshot()
        let reader = DeferredRouteReader()
        let model = TripsModel(
            repository: RouteTestSourceReader(snapshot: snapshot, failure: .unavailable),
            routeReader: reader)
        await model.select(snapshot.trip.id)
        #expect(model.failure == .unavailable)
        await reader.waitFor(1)
        let current = route(snapshot.trip.id, revision: 2)
        await reader.complete(1, value: current)
        await model.route.readTask?.value
        #expect(model.route.state == .loaded(current))
        #expect(model.snapshot == nil)
    }

    @Test("source browsing completes while the route is pending, and survives its failure")
    internal func sourceSuccess() async throws {
        let snapshot = try TripTestSources.snapshot()
        let reader = DeferredRouteReader()
        let model = TripsModel(
            repository: RouteTestSourceReader(snapshot: snapshot, failure: nil), routeReader: reader
        )
        await model.select(snapshot.trip.id)
        #expect(model.snapshot == snapshot)
        #expect(!model.loading)
        #expect(model.route.state == .loading)
        await reader.waitFor(1)
        await reader.complete(1, error: .unavailable)
        await model.route.readTask?.value
        #expect(model.snapshot == snapshot)
        #expect(model.failure == nil)
        #expect(model.route.state == .failed(.unavailable))
    }

    private func route(_ id: Int, revision: Int) -> TripRouteSnapshot {
        TripRouteSnapshot(tripId: id, revision: revision, order: [], paths: [], missingSources: [])
    }
}

private struct RouteTestSourceReader: TripsReading {
    let snapshot: TripSnapshot
    let failure: RepositoryError?
    func trips() async throws -> [TripRecord] { [snapshot.trip] }
    func trip(id: Int) async throws -> TripSnapshot? {
        if let failure { throw failure }
        return snapshot
    }
}

private actor DeferredRouteReader: TripsRouteReading {
    private var calls = 0
    private var pending: [Int: CheckedContinuation<TripRouteSnapshot?, any Error>] = [:]
    private var waiters: [Int: CheckedContinuation<Void, Never>] = [:]

    func route(tripId: Int) async throws -> TripRouteSnapshot? {
        calls += 1
        let call = calls
        return try await withCheckedThrowingContinuation { continuation in
            pending[call] = continuation
            waiters.removeValue(forKey: call)?.resume()
        }
    }

    func waitFor(_ call: Int) async {
        if pending[call] != nil { return }
        await withCheckedContinuation { waiters[call] = $0 }
    }

    func complete(_ call: Int, value: TripRouteSnapshot? = nil, error: RepositoryError? = nil) {
        guard let continuation = pending.removeValue(forKey: call) else { return }
        if let error {
            continuation.resume(throwing: error)
        } else {
            continuation.resume(returning: value)
        }
    }
}
