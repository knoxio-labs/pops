import AppCore
import Testing

@testable import FeatureTrips

@Suite("Shared native tab selection")
@MainActor
internal struct TripsTabSelectionTests {
    @Test("accepted capture refreshes only its currently selected Inbox")
    internal func acceptedCapture() async throws {
        let snapshot = try TripTestSources.snapshot()
        let reader = TabSelectionReader(snapshot: snapshot)
        let model = TripsModel(repository: reader, captureReader: reader)
        await model.select(snapshot.trip.id)
        await model.inbox.readTask?.value
        model.captureAccepted(tripID: 987)
        #expect(await reader.requestedCaptures == [snapshot.trip.id])
        model.captureAccepted(tripID: snapshot.trip.id)
        await model.inbox.readTask?.value
        #expect(await reader.requestedCaptures == [snapshot.trip.id, snapshot.trip.id])
        await model.select(987)
        await model.inbox.readTask?.value
        model.captureAccepted(tripID: snapshot.trip.id)
        #expect(await reader.requestedCaptures == [snapshot.trip.id, snapshot.trip.id, 987])
        #expect(model.inbox.selectedID == 987)
    }

    @Test("choosing a trip preserves the active tab")
    internal func selectedTab() async throws {
        let snapshot = try TripTestSources.snapshot()
        let model = TripsModel(repository: TabSelectionReader(snapshot: snapshot))
        for tab in [TripsTab.today, .plan, .inbox, .search] {
            model.tab = tab
            await model.select(snapshot.trip.id)
            #expect(model.tab == tab)
            #expect(model.selectedID == snapshot.trip.id)
        }
    }

    @Test("opening a visit moves to Plan and consumes its shared scroll target")
    internal func planVisitNavigation() throws {
        let model = TripsModel(
            repository: TabSelectionReader(snapshot: try TripTestSources.snapshot()))
        model.tab = .today

        model.openPlanTarget(.root(.visit(42)))

        #expect(model.tab == .plan)
        #expect(model.pendingPlanTarget == .root(.visit(42)))
        #expect(model.consumePendingPlanTarget() == .root(.visit(42)))
        #expect(model.pendingPlanTarget == nil)
    }

    @Test("selecting another trip clears an unconsumed Plan visit target")
    internal func planVisitTargetDoesNotCrossTrips() async throws {
        let first = try TripTestSources.snapshot()
        let second = TripSnapshot(
            trip: TripRecord(
                id: 987, name: "Second trip", destination: "", when: "",
                tagId: nil, parentId: nil, notes: "", sourceLinks: []),
            places: [], visits: [], journeys: [], journeyGroups: [], stays: [], events: [],
            documentAssociations: [])
        let model = TripsModel(repository: TabSelectionReader(snapshots: [first, second]))
        await model.select(first.trip.id)
        model.openPlanTarget(.root(.visit(42)))

        await model.select(second.trip.id)

        #expect(model.selectedID == second.trip.id)
        #expect(model.pendingPlanTarget == nil)
    }

    @Test("explicit selection starts capture reading even when detail fails")
    internal func independentInbox() async throws {
        let snapshot = try TripTestSources.snapshot()
        let reader = TabSelectionReader(snapshot: snapshot, failsDetail: true)
        let model = TripsModel(repository: reader, captureReader: reader)
        await model.select(snapshot.trip.id)
        await model.inbox.readTask?.value
        #expect(model.failure == .unavailable)
        #expect(model.snapshot == nil)
        #expect(model.inbox.selectedID == snapshot.trip.id)
        #expect(model.inbox.state == .loaded(TripCaptureWorkspace(captures: [])))
        #expect(await reader.requestedCaptures == [snapshot.trip.id])
        for tab in [TripsTab.plan, .inbox, .search, .today] {
            model.tab = tab
            #expect(model.selectedID == snapshot.trip.id)
            #expect(model.inbox.selectedID == snapshot.trip.id)
        }
        #expect(await reader.requestedCaptures == [snapshot.trip.id])
    }

    @Test("removing an explicit selection clears the independent capture reader")
    internal func removedSelection() async throws {
        let snapshot = try TripTestSources.snapshot()
        let reader = TabSelectionReader(snapshot: snapshot)
        let model = TripsModel(repository: reader, captureReader: reader)
        await model.select(987)
        await model.inbox.readTask?.value
        #expect(model.inbox.selectedID == 987)
        await model.load()
        #expect(model.selectedID == nil)
        #expect(model.inbox.selectedID == nil)
        #expect(model.inbox.state == .idle)
        #expect(model.inbox.readTask == nil)
    }
}

private actor TabSelectionReader: TripsReading, TripCapturesReading {
    let snapshots: [TripSnapshot]
    let failsDetail: Bool
    private(set) var requestedCaptures: [Int] = []

    init(snapshot: TripSnapshot, failsDetail: Bool = false) {
        snapshots = [snapshot]
        self.failsDetail = failsDetail
    }

    init(snapshots: [TripSnapshot]) {
        self.snapshots = snapshots
        failsDetail = false
    }

    func trips() async throws -> [TripRecord] { snapshots.map(\.trip) }
    func trip(id: Int) async throws -> TripSnapshot? {
        if failsDetail { throw RepositoryError.unavailable }
        return snapshots.first { $0.trip.id == id }
    }
    func captures(tripID: Int) async throws -> TripCaptureWorkspace {
        requestedCaptures.append(tripID)
        return TripCaptureWorkspace(captures: [])
    }
}
