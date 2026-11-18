import AppCore
import SwiftUI
import Testing
import ViewInspector

@testable import FeatureTrips

@Suite("Today focus and plan")
@MainActor
internal struct TripsTodayContentTests {
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
