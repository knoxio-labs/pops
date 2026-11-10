import AppCore
import Testing
import ViewInspector

@testable import FeatureTrips

@MainActor
internal struct TripNavigationTestContext {
    internal let first: TripSnapshot
    internal let second: TripSnapshot
    internal let reader: IntentReader
    internal let model: TripsModel
    internal let root: TripsRootView

    internal static func make() async throws -> Self {
        let first = try TripTestSources.snapshot()
        let second = TripSnapshot(
            trip: TripRecord(
                id: 2, name: "Intent B", destination: "", when: "",
                tagId: nil, parentId: nil, notes: "", sourceLinks: []), places: [], visits: [],
            journeys: [], journeyGroups: [], stays: [], events: [], documentAssociations: [])
        let reader = IntentReader(trips: [first.trip, second.trip])
        let model = TripsModel(repository: reader)
        await model.load()
        let seed = Task { await model.select(first.trip.id) }
        await reader.waitFor(1)
        await reader.complete(1, snapshot: first)
        await seed.value
        return Self(
            first: first, second: second, reader: reader, model: model,
            root: TripsRootView(model: model, documents: reader))
    }

    internal func tap(query: String) throws {
        let search = try root.inspect().find(TripsSearchView.self).actualView()
        let results = TripsSearchResults(
            trips: search.trips, snapshot: search.snapshot,
            selectTrip: search.selectTrip, openSource: search.openSource, query: query)
        let buttons = try results.inspect().findAll(ViewType.Button.self)
        #expect(buttons.count == 1)
        try #require(buttons.first).tap()
    }

    internal func startSource() async throws -> Task<Void, Never> {
        try tap(query: try #require(first.stays.first?.reference))
        let task = try #require(model.navigationTask)
        await reader.waitFor(2)
        return task
    }

    internal func finish(_ index: Int, snapshot: TripSnapshot, fails: Bool = false) async throws {
        let task = try #require(model.navigationTask)
        await reader.waitFor(index)
        await reader.complete(index, snapshot: snapshot, fails: fails)
        await task.value
    }
}

internal actor IntentReader: TripsReading, DocumentsReading {
    private let records: [TripRecord]
    private var count = 0
    internal private(set) var requested: [Int] = []
    private var pending: [Int: CheckedContinuation<TripSnapshot?, any Error>] = [:]
    private var waiters: [Int: CheckedContinuation<Void, Never>] = [:]

    internal init(trips: [TripRecord]) { records = trips }
    func trips() async throws -> [TripRecord] { records }
    func trip(id: Int) async throws -> TripSnapshot? {
        requested.append(id)
        count += 1
        let index = count
        return try await withCheckedThrowingContinuation { continuation in
            pending[index] = continuation
            waiters.removeValue(forKey: index)?.resume()
        }
    }
    func waitFor(_ index: Int) async {
        if pending[index] != nil { return }
        await withCheckedContinuation { waiters[index] = $0 }
    }
    func complete(_ index: Int, snapshot: TripSnapshot, fails: Bool = false) {
        let continuation = pending.removeValue(forKey: index)
        if fails {
            continuation?.resume(throwing: RepositoryError.unavailable)
        } else {
            continuation?.resume(returning: snapshot)
        }
    }
    func document(id: Int) async throws -> DocumentOriginal? { nil }
    func file(id: Int) async throws -> DownloadedDocument { throw DocumentAccessError.notFound }
}
