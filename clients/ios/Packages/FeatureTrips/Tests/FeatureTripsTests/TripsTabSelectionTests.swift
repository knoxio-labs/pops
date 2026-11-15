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

    @Test("choosing a trip in Plan or Inbox preserves the active tab")
    internal func selectedTab() async throws {
        let snapshot = try TripTestSources.snapshot()
        let model = TripsModel(repository: TabSelectionReader(snapshot: snapshot))
        for tab in [TripsTab.plan, .inbox] {
            model.tab = tab
            await model.select(snapshot.trip.id)
            #expect(model.tab == tab)
            #expect(model.selectedID == snapshot.trip.id)
        }
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
        for tab in [TripsTab.plan, .inbox, .search, .trips] {
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
    let snapshot: TripSnapshot
    let failsDetail: Bool
    private(set) var requestedCaptures: [Int] = []

    init(snapshot: TripSnapshot, failsDetail: Bool = false) {
        self.snapshot = snapshot
        self.failsDetail = failsDetail
    }

    func trips() async throws -> [TripRecord] { [snapshot.trip] }
    func trip(id: Int) async throws -> TripSnapshot? {
        if failsDetail { throw RepositoryError.unavailable }
        return snapshot.trip.id == id ? snapshot : nil
    }
    func captures(tripID: Int) async throws -> TripCaptureWorkspace {
        requestedCaptures.append(tripID)
        return TripCaptureWorkspace(captures: [])
    }
}
