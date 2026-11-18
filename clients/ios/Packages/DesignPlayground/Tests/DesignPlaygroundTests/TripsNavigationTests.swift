import AppCore
import SwiftUI
import Testing
import ViewInspector

@testable import FeatureTrips

@Suite("One Trip workspace")
@MainActor
internal struct TripsNavigationTests {
    @Test("Today, Plan, Inbox and native Search are navigation tabs")
    internal func appDestinations() throws {
        let reader = NavigationReader()
        let view = TripsRootView(repository: reader, documents: reader)
        let tabs = try view.inspect().find(ViewType.TabView.self)
        #expect(tabs.count == 4)
    }

    @Test("Today renders the selected snapshot and retains its exact reader identity")
    internal func selectedTimeline() async throws {
        let snapshot = try TripNavigationTestContext.snapshot()
        let reader = NavigationReader(snapshot: snapshot)
        let model = TripsModel(repository: reader)
        await model.select(snapshot.trip.id)
        let root = TripsRootView(model: model, documents: reader)
        let today = try root.inspect().find(TripsTodayView.self).actualView()
        #expect(today.snapshot == snapshot)
        #expect(try root.inspect().findAll(ViewType.TabView.self).count == 1)
        #expect(await reader.requested == [snapshot.trip.id])
    }

    @Test("Today keeps every simultaneously active source visible")
    internal func concurrentNowSources() throws {
        let original = try TripNavigationTestContext.snapshot()
        let event = TripEvent(
            id: 99, tripId: original.trip.id, visitId: nil, name: "Parallel event",
            intention: "Considering", arrangement: nil, purchase: nil,
            timing: TripEventTiming(
                start: "2026-01-02", end: "2026-01-02", startTime: "11:00",
                endTime: "13:00", timeZone: "UTC"),
            address: nil, reference: nil, sourceUrl: nil, ticketUrl: nil, notes: "",
            sourceLinks: [], venueLinks: [], organiserLinks: [], documentLinks: [])
        let snapshot = TripSnapshot(
            trip: original.trip, places: original.places, visits: original.visits,
            journeys: original.journeys, journeyGroups: original.journeyGroups,
            stays: original.stays, events: [event],
            documentAssociations: original.documentAssociations)
        let date = try #require(TripClock.instant(local: "2026-01-02T12:00", zone: "UTC"))
        let view = TripsTodayContent(snapshot: snapshot, date: date)
        let rendered = try view.environment(\.timeZone, .gmt).inspect()
            .find(text: "Parallel event").string()
        #expect(rendered == "Parallel event")
    }

    @Test("Inbox is part of the selected Trip workspace")
    internal func inboxWorkspace() async throws {
        let snapshot = try TripNavigationTestContext.snapshot()
        let reader = NavigationReader(snapshot: snapshot)
        let model = TripsModel(repository: reader)
        await model.select(snapshot.trip.id)
        model.tab = .inbox
        let view = TripsWorkspaceView(model: model, tab: .inbox)
        #expect(try view.inspect().find(TripsInboxView.self).actualView().model === model.inbox)
    }

    @Test("source destinations belong only to the active tab and switching clears detail")
    internal func tabScopedDetails() async throws {
        let snapshot = try TripNavigationTestContext.snapshot()
        let reader = NavigationReader(snapshot: snapshot)
        let model = TripsModel(repository: reader)
        await model.select(snapshot.trip.id)
        let source = try #require(allTripSources(snapshot).first)
        let today = TripsSelectedTripStack(
            model: model, tab: .today, documents: reader, capture: nil)
        let plan = TripsSelectedTripStack(
            model: model, tab: .plan, documents: reader, capture: nil)
        let inbox = TripsSelectedTripStack(
            model: model, tab: .inbox, documents: reader, capture: nil)
        model.source = source
        #expect(today.sourceSelection.wrappedValue == source)
        #expect(plan.sourceSelection.wrappedValue == nil)
        #expect(inbox.sourceSelection.wrappedValue == nil)
        plan.sourceSelection.wrappedValue = nil
        #expect(model.source == source)
        model.tab = .plan
        #expect(model.source == nil)
        plan.sourceSelection.wrappedValue = source
        #expect(plan.sourceSelection.wrappedValue == source)
        #expect(today.sourceSelection.wrappedValue == nil)
        today.sourceSelection.wrappedValue = nil
        #expect(model.source == source)
        model.tab = .inbox
        #expect(model.source == nil)
        #expect(model.selectedID == snapshot.trip.id)
        #expect(model.snapshot == snapshot)
    }

    @Test("calendar grouping preserves undated originals and spanning intervals inside a range")
    internal func undatedAndSpanningRows() throws {
        let snapshot = try TripNavigationTestContext.snapshot()
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
        let snapshot = try TripNavigationTestContext.snapshot()
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
        let snapshot = try TripNavigationTestContext.snapshot()
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
