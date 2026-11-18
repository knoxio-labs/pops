import AppCore
import SwiftUI
import Testing
import ViewInspector

@testable import FeatureTrips

@Suite("Today focus and plan")
@MainActor
internal struct TripsTodayContentTests {
    @Test("Today does not offer route navigation until the canonical route is loaded")
    internal func routeActionsWaitForRoute() throws {
        let snapshot = try TripNavigationTestContext.snapshot()
        let date = try #require(TripClock.instant(local: "2026-01-01T12:00", zone: "UTC"))
        let inspected = try TripsTodayContent(snapshot: snapshot, date: date, route: nil)
            .environment(\.timeZone, .gmt)
            .inspect()

        #expect(inspected.findAll(TripsChapterRail.self).isEmpty)
        #expect(inspected.findAll(TripsTodayNeedsYouView.self).isEmpty)
    }

    @Test("loaded route chapters and gaps open the matching Plan target")
    internal func loadedRouteActionsOpenPlanTargets() throws {
        let snapshot = try TripNavigationTestContext.snapshot()
        let visit = try #require(snapshot.visits.first)
        let route = TripRouteSnapshot(
            tripId: snapshot.trip.id, revision: 1,
            order: [.gap(999), .visit(visit.id)], paths: [], missingSources: [])
        let date = try #require(TripClock.instant(local: "2026-01-01T12:00", zone: "UTC"))
        var selectedTargets: [TripPlanLineIdentity] = []
        let inspected = try TripsTodayContent(
            snapshot: snapshot, date: date, route: route,
            selectPlanTarget: { selectedTargets.append($0) }
        )
        .environment(\.timeZone, .gmt)
        .inspect()

        #expect(inspected.findAll(TripsChapterRail.self).count == 1)
        #expect(inspected.findAll(TripsTodayNeedsYouView.self).count == 1)
        #expect(try inspected.find(text: "The route").string() == "The route")
        #expect(try inspected.find(text: "1 stop").string() == "1 stop")
        try inspected.find(TripsChapterRail.self).find(ViewType.Button.self).tap()
        #expect(selectedTargets == [.root(.visit(visit.id))])
        try inspected.find(TripsTodayNeedsYouView.self).find(ViewType.Button.self).tap()
        #expect(selectedTargets == [.root(.visit(visit.id)), .root(.gap(999))])
    }

    @Test("Today promotes the first future source and excludes it from the four later rows")
    internal func nextFocusDoesNotRepeat() throws {
        let original = try TripNavigationTestContext.snapshot()
        let events = (0..<6).map { index in
            plannedEvent(
                index + 100, name: "Future \(index)",
                day: "2026-01-0\(index + 2)", time: "09:00")
        }
        let snapshot = TripSnapshot(
            trip: original.trip, places: original.places, visits: [], journeys: [],
            journeyGroups: [], stays: [], events: events, documentAssociations: [])
        let date = try #require(TripClock.instant(local: "2026-01-01T12:00", zone: "UTC"))
        let inspected = try TripsTodayContent(snapshot: snapshot, date: date)
            .environment(\.timeZone, .gmt)
            .inspect()
        let renderedTexts = try inspected.findAll(ViewType.Text.self).map { try $0.string() }
        let labels =
            try inspected
            .findAll(ViewType.NavigationLink.self)
            .map { link in
                try link.labelView().findAll(ViewType.Text.self).map { try $0.string() }
            }

        let focused = try #require(labels.first { $0.contains("UP NEXT") })
        let upcoming = labels.filter { !$0.contains("UP NEXT") }.flatMap { $0 }
        #expect(focused.contains("Future 0"))
        #expect(!renderedTexts.contains("Next · Future 0"))
        #expect(labels.filter { !$0.contains("UP NEXT") }.count == 4)
        #expect((1...4).allSatisfy { upcoming.contains("Future \($0)") })
        #expect(!upcoming.contains("Future 0"))
        #expect(!upcoming.contains("Future 5"))
    }

    @Test("the upcoming focus precedes route and attention sections before the trip starts")
    internal func beforeTripFocusPrecedesRouteAndAttention() throws {
        let snapshot = try TripNavigationTestContext.snapshot()
        let route = TripRouteSnapshot(
            tripId: snapshot.trip.id, revision: 1,
            order: [.visit(4), .gap(999)], paths: [], missingSources: [])
        let date = try #require(TripClock.instant(local: "2025-12-30T12:00", zone: "UTC"))
        let texts = try TripsTodayContent(snapshot: snapshot, date: date, route: route)
            .environment(\.timeZone, .gmt)
            .inspect()
            .findAll(ViewType.Text.self)
            .map { try $0.string() }

        let next = try #require(texts.firstIndex(of: "UP NEXT"))
        let chapters = try #require(texts.firstIndex(of: "The route"))
        let attention = try #require(texts.firstIndex(of: "Needs your attention"))
        #expect(next < chapters)
        #expect(chapters < attention)
    }

    @Test("Today keeps the other sources that share the next start time")
    internal func sameStartSourcesRemainVisible() throws {
        let original = try TripNavigationTestContext.snapshot()
        let events = [
            plannedEvent(100, name: "First event", day: "2026-01-02", time: "09:00"),
            plannedEvent(101, name: "Second event", day: "2026-01-02", time: "09:00"),
        ]
        let snapshot = TripSnapshot(
            trip: original.trip, places: original.places, visits: [], journeys: [],
            journeyGroups: [], stays: [], events: events, documentAssociations: [])
        let date = try #require(TripClock.instant(local: "2026-01-01T12:00", zone: "UTC"))
        let labels = try TripsTodayContent(snapshot: snapshot, date: date)
            .environment(\.timeZone, .gmt)
            .inspect()
            .findAll(ViewType.NavigationLink.self)
            .map { link in
                try link.labelView().findAll(ViewType.Text.self).map { try $0.string() }
            }

        #expect(labels.contains { $0.contains("UP NEXT") && $0.contains("First event") })
        #expect(labels.contains { !$0.contains("UP NEXT") && $0.contains("Second event") })
    }

    @Test("Now and Next remain distinct when the upcoming focus is summarized")
    internal func nextFocusDoesNotRepeatAlongsideNow() throws {
        let original = try TripNavigationTestContext.snapshot()
        let currentStay = try #require(original.stays.first { $0.id == 1 })
        let event = plannedEvent(
            100, name: "Tomorrow appointment", day: "2026-01-03", time: "09:00")
        let snapshot = TripSnapshot(
            trip: original.trip, places: original.places, visits: [], journeys: [],
            journeyGroups: [], stays: [currentStay], events: [event],
            documentAssociations: [])
        let date = try #require(TripClock.instant(local: "2026-01-02T12:00", zone: "UTC"))
        let labels = try TripsTodayContent(snapshot: snapshot, date: date)
            .environment(\.timeZone, .gmt)
            .inspect()
            .findAll(ViewType.NavigationLink.self)
            .map { link in
                try link.labelView().findAll(ViewType.Text.self).map { try $0.string() }
            }
            .map { $0.joined(separator: " ") }

        #expect(labels.contains { $0.contains("HAPPENING NOW") && $0.contains("Current stay") })
        #expect(labels.contains { $0.contains("UP NEXT") && $0.contains("Tomorrow appointment") })
        #expect(!labels.contains { !$0.contains("UP NEXT") && $0.contains("Tomorrow appointment") })
    }

    @Test("Today keeps undated sources available while limiting the section to three")
    internal func unscheduledSourcesStayVisible() throws {
        let original = try TripNavigationTestContext.snapshot()
        let events = (0..<5).map { index in
            plannedEvent(index + 100, name: "Unscheduled \(index)", day: nil, time: nil)
        }
        let snapshot = TripSnapshot(
            trip: original.trip, places: original.places, visits: [], journeys: [],
            journeyGroups: [], stays: [], events: events, documentAssociations: [])
        let date = try #require(TripClock.instant(local: "2026-01-01T12:00", zone: "UTC"))
        let strings = try TripsTodayContent(snapshot: snapshot, date: date)
            .environment(\.timeZone, .gmt)
            .inspect()
            .findAll(ViewType.Text.self)
            .map { try $0.string() }

        #expect(strings.contains("Still in your plan"))
        #expect((0...2).allSatisfy { strings.contains("Unscheduled \($0)") })
        #expect(!strings.contains("Unscheduled 3"))
        #expect(!strings.contains("Unscheduled 4"))
    }

    private func plannedEvent(_ id: Int, name: String, day: String?, time: String?) -> TripEvent {
        TripEvent(
            id: id, tripId: 1, visitId: nil, name: name, intention: "Considering",
            arrangement: nil, purchase: nil,
            timing: TripEventTiming(
                start: day, end: nil, startTime: time, endTime: nil,
                timeZone: time == nil ? nil : "UTC"),
            address: nil, reference: nil, sourceUrl: nil, ticketUrl: nil, notes: "",
            sourceLinks: [], venueLinks: [], organiserLinks: [], documentLinks: [])
    }
}
