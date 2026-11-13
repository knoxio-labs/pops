import AppCore
import Testing

@testable import FeatureTrips

@Suite("Trip source loading")
@MainActor
internal struct TripsModelTests {
    @Test("loading the catalogue never silently selects a trip, and selection loads its own source")
    internal func explicitSelection() async throws {
        let snapshot = try TripTestSources.snapshot()
        let repository = TripTestRepository(snapshot: snapshot)
        let model = TripsModel(repository: repository)
        await model.load()
        #expect(model.trips == [snapshot.trip])
        #expect(model.snapshot == nil)
        #expect(model.selectedID == nil)
        #expect(await repository.ids == [])
        await model.select(snapshot.trip.id)
        #expect(model.snapshot == snapshot)
        #expect(await repository.ids == [snapshot.trip.id])
    }

    @Test("missing and failed source reads do not become an empty successful trip")
    internal func missingAndFailed() async throws {
        let snapshot = try TripTestSources.snapshot()
        let repository = TripTestRepository(snapshot: snapshot)
        let model = TripsModel(repository: repository)
        await model.load()
        await model.select(987)
        #expect(model.snapshot == nil)
        #expect(model.selectedID == 987)
        #expect(model.failure == nil)
        await repository.refuse()
        await model.select(snapshot.trip.id)
        #expect(model.snapshot == nil)
        #expect(model.failure == .featureUnavailable)
        #expect(!model.loading)
        #expect(model.trips == [snapshot.trip])
    }

    @Test(
        "an injected saved selection restores its exact Timeline, while a fresh selection stays explicit"
    )
    internal func restoreSelection() async throws {
        let snapshot = try TripTestSources.snapshot()
        let repository = TripTestRepository(snapshot: snapshot)
        let selection = TripSelectionMemory(id: snapshot.trip.id)
        let model = TripsModel(repository: repository, selection: selection)
        await model.load()
        #expect(model.selectedID == snapshot.trip.id)
        #expect(model.snapshot == snapshot)
        #expect(selection.accepted == [snapshot.trip.id])
        await model.select(987)
        #expect(model.snapshot == nil)
        #expect(selection.accepted == [snapshot.trip.id])
    }

    @Test("an absent saved Trip never falls back to another catalogue row")
    internal func absentSelection() async throws {
        let snapshot = try TripTestSources.snapshot()
        let selection = TripSelectionMemory(id: 987)
        let model = TripsModel(
            repository: TripTestRepository(snapshot: snapshot), selection: selection)
        await model.load()
        #expect(model.selectedID == nil)
        #expect(model.snapshot == nil)
        #expect(selection.accepted.isEmpty)
    }
}

@MainActor
private final class TripSelectionMemory: TripOfflineSelection {
    let id: Int?
    private(set) var accepted: [Int] = []
    init(id: Int?) { self.id = id }
    func selectedTripID() throws -> Int? { id }
    func selectTrip(_ id: Int) throws { accepted.append(id) }
}

private actor TripTestRepository: TripsReading {
    private let snapshot: TripSnapshot
    private var refused = false
    internal private(set) var ids: [Int] = []

    internal init(snapshot: TripSnapshot) { self.snapshot = snapshot }
    internal func refuse() { refused = true }
    internal func trips() async throws -> [TripRecord] { [snapshot.trip] }
    internal func trip(id: Int) async throws -> TripSnapshot? {
        ids.append(id)
        if refused { throw RepositoryError.featureUnavailable }
        return id == snapshot.trip.id ? snapshot : nil
    }
}
