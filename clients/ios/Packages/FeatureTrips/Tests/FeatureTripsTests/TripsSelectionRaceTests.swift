import AppCore
import Testing

@testable import FeatureTrips

@Suite("Trip selection identity")
@MainActor
internal struct TripsSelectionRaceTests {
    @Test("a late response for the previous trip cannot overwrite the current selection")
    internal func lateSource() async throws {
        let first = try TripTestSources.snapshot()
        let second = otherTrip()
        let repository = DeferredTripReader()
        let model = TripsModel(repository: repository)
        let firstRead = Task { await model.select(first.trip.id) }
        await repository.waitFor(first.trip.id)
        let secondRead = Task { await model.select(second.trip.id) }
        await repository.waitFor(second.trip.id)
        await repository.complete(second.trip.id, source: second)
        await secondRead.value
        await repository.complete(first.trip.id, source: first)
        await firstRead.value
        #expect(model.selectedID == second.trip.id)
        #expect(model.snapshot == second)
        #expect(model.failure == nil)
    }

    @Test("an injected reader returning another source fails without displaying it")
    internal func wrongSource() async throws {
        let source = try TripTestSources.snapshot()
        let repository = DeferredTripReader()
        let model = TripsModel(repository: repository)
        let task = Task { await model.select(2) }
        await repository.waitFor(2)
        await repository.complete(2, source: source)
        await task.value
        #expect(model.snapshot == nil)
        #expect(model.failure == .contractMismatch)
        #expect(model.selectedID == 2)
    }

    private func otherTrip() -> TripSnapshot {
        TripSnapshot(
            trip: TripRecord(
                id: 2, name: "Other trip", destination: "", when: "", tagId: nil,
                parentId: nil, notes: "", sourceLinks: []),
            places: [], visits: [], journeys: [], journeyGroups: [], stays: [], events: [],
            documentAssociations: [])
    }
}

private actor DeferredTripReader: TripsReading {
    private var pending: [Int: CheckedContinuation<TripSnapshot?, any Error>] = [:]
    private var waiters: [Int: [CheckedContinuation<Void, Never>]] = [:]

    internal func trips() async throws -> [TripRecord] { [] }

    internal func trip(id: Int) async throws -> TripSnapshot? {
        try await withCheckedThrowingContinuation { continuation in
            pending[id] = continuation
            for waiter in waiters.removeValue(forKey: id) ?? [] { waiter.resume() }
        }
    }

    internal func waitFor(_ id: Int) async {
        if pending[id] != nil { return }
        await withCheckedContinuation { waiters[id, default: []].append($0) }
    }

    internal func complete(_ id: Int, source: TripSnapshot) {
        pending.removeValue(forKey: id)?.resume(returning: source)
    }
}
