import AppCore
import Foundation
import SwiftUI
import Testing
import ViewInspector

@testable import FeatureTrips

@Suite("One Trip workspace")
@MainActor
internal struct TripsNavigationTests {
    @Test("only Trips and app-level Search are navigation tabs")
    internal func appDestinations() throws {
        let reader = NavigationReader()
        let view = TripsRootView(repository: reader, documents: reader)
        let tabs = try view.inspect().find(ViewType.TabView.self)
        #expect(tabs.count == 2)
    }

    @Test("the selected snapshot is the one Timeline and retains its exact reader identity")
    internal func selectedTimeline() async throws {
        let snapshot = try TripTestSources.snapshot()
        let reader = NavigationReader(snapshot: snapshot)
        let model = TripsModel(repository: reader)
        await model.select(snapshot.trip.id)
        let root = TripsRootView(model: model, documents: reader)
        let timeline = try root.inspect().find(TripsTimelineView.self).actualView()
        #expect(timeline.snapshot == snapshot)
        #expect(try root.inspect().findAll(ViewType.TabView.self).count == 1)
        #expect(await reader.requested == [snapshot.trip.id])
    }

    @Test("calendar grouping preserves undated originals and spanning intervals inside a range")
    internal func undatedAndSpanningRows() throws {
        let snapshot = try TripTestSources.snapshot()
        var filter = TripTimelineFilter()
        filter.grouping = .day
        filter.fromDay = "2026-01-02"
        filter.throughDay = "2026-01-02"
        let sources = filter.sources(in: snapshot, at: .now, zone: .gmt)
        let view = TripsTimelineCalendar(sources: sources, places: snapshot.places, filter: filter)
        let rows = try view.environment(\.timeZone, .gmt).inspect().findAll(TripsSourceRow.self)
        let values = try rows.map { try $0.actualView().source.id }
        #expect(values.contains("stay-1"))
        #expect(values.contains("journey-2"))
    }

    @Test(
        "app search invokes exact source and trip actions instead of creating a second detail route"
    )
    internal func searchActions() throws {
        let snapshot = try TripTestSources.snapshot()
        var chosen: [String] = []
        var trips: [Int] = []
        let sources = TripsSearchResults(
            trips: [], snapshot: snapshot,
            selectTrip: { trips.append($0) }, openSource: { chosen.append($0.id) },
            query: "SOURCE123")
        let buttons = try sources.inspect().findAll(ViewType.Button.self)
        #expect(buttons.count == 1)
        try #require(buttons.first).tap()
        #expect(chosen == ["stay-1"])
        #expect(trips.isEmpty)
        #expect(try sources.inspect().findAll(ViewType.NavigationLink.self).isEmpty)
        let catalogue = TripsSearchResults(
            trips: [snapshot.trip], snapshot: nil,
            selectTrip: { trips.append($0) }, openSource: { chosen.append($0.id) },
            query: try #require(snapshot.trip.name))
        try #require(catalogue.inspect().findAll(ViewType.Button.self).first).tap()
        #expect(trips == [snapshot.trip.id])
    }

    @Test(
        "contextual details resolve the current record and reject a foreign Trip with a colliding ID"
    )
    internal func canonicalDetails() async throws {
        let snapshot = try TripTestSources.snapshot()
        let reader = NavigationReader(snapshot: snapshot)
        let model = TripsModel(repository: reader)
        await model.select(snapshot.trip.id)
        let journey = try #require(snapshot.journeys.first)
        let stale = TripJourney(
            id: journey.id, tripId: journey.tripId, name: "Stale name",
            reference: journey.reference, notes: journey.notes, sourceLinks: journey.sourceLinks,
            buffers: journey.buffers, legs: journey.legs)
        #expect(model.canonicalSource(.journey(stale)) == .journey(journey))
        let foreign = TripJourney(
            id: journey.id, tripId: 999, name: journey.name,
            reference: journey.reference, notes: journey.notes, sourceLinks: journey.sourceLinks,
            buffers: journey.buffers, legs: journey.legs)
        #expect(model.canonicalSource(.journey(foreign)) == nil)
    }
}

private actor NavigationReader: TripsReading, DocumentsReading {
    private let snapshot: TripSnapshot?
    internal private(set) var requested: [Int] = []
    internal init(snapshot: TripSnapshot? = nil) { self.snapshot = snapshot }
    func trips() async throws -> [TripRecord] { snapshot.map { [$0.trip] } ?? [] }
    func trip(id: Int) async throws -> TripSnapshot? {
        requested.append(id)
        return snapshot?.trip.id == id ? snapshot : nil
    }
    func document(id: Int) async throws -> DocumentOriginal? { nil }
    func file(id: Int) async throws -> DownloadedDocument { throw DocumentAccessError.notFound }
}
