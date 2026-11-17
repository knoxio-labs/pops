import AppCore
import DesignSystem
import Foundation
import Testing

@testable import FeatureTrips

@Suite("Today timeline presentation")
internal struct TripTimelinePresentationTests {
    @Test("the timeline leads with dated visits and keeps each place's own sources together")
    internal func dayGroups() throws {
        let snapshot = try TripTestSources.snapshot()
        let groups = tripTimelineGroups(
            snapshot: snapshot, sources: allTripSources(snapshot), visits: snapshot.visits,
            grouping: .day, zone: .gmt)

        #expect(
            groups.map(\.id) == [
                "day-2026-01-01", "day-2026-01-02", "day-2026-01-04", "day-2026-02-01",
                "undated",
            ])
        guard case .visit(let visit) = try #require(groups.first?.entries.first) else {
            Issue.record("The recorded Recife visit should lead its own day")
            return
        }
        #expect(visit.placeName == "Recife")
        #expect(visit.sources.map(\.id) == ["stay-1"])
        #expect(groups.last?.entries.map(\.id) == ["journey-2"])
    }

    @Test("month grouping keeps unresolved dates separate and does not duplicate stay spans")
    internal func monthGroups() throws {
        let snapshot = try TripTestSources.snapshot()
        let groups = tripTimelineGroups(
            snapshot: snapshot, sources: allTripSources(snapshot), visits: snapshot.visits,
            grouping: .month, zone: .gmt)

        #expect(groups.map(\.title) == ["January 2026", "February 2026", "Dates to decide"])
        #expect(groups[0].entries.map(\.id) == ["visit-4", "stay-3", "stay-2"])
        #expect(groups[1].entries.map(\.id) == ["journey-1"])
        #expect(groups[2].entries.map(\.id) == ["journey-2"])
    }

    @Test("recorded grouping explains place-linked records separately from journeys")
    internal func recordedGroups() throws {
        let snapshot = try TripTestSources.snapshot()
        let groups = tripTimelineGroups(
            snapshot: snapshot, sources: allTripSources(snapshot), visits: snapshot.visits,
            grouping: .sourceOrder, zone: .gmt)

        #expect(groups.map(\.title) == ["Places", "Journeys", "Other plans"])
        #expect(
            groups.map { $0.entries.map(\.id) } == [
                ["visit-4"], ["journey-1", "journey-2"], ["stay-2", "stay-3"],
            ])
    }

    @Test("source styling only names transport modes explicitly recorded on every leg")
    internal func sourceStyleUsesRecordedModes() throws {
        let snapshot = try TripTestSources.snapshot()
        let recordedFlight = try #require(snapshot.journeys.first { $0.id == 1 })
        let unknownJourney = try #require(snapshot.journeys.first { $0.id == 2 })
        let recordedStay = try #require(snapshot.stays.first { $0.id == 1 })
        let recordedEvent = try #require(snapshot.events.first)

        let flightStyle = TripsSourceStyle(source: .journey(recordedFlight))
        let unknownStyle = TripsSourceStyle(source: .journey(unknownJourney))
        let stayStyle = TripsSourceStyle(source: .stay(recordedStay))
        let eventStyle = TripsSourceStyle(source: .event(recordedEvent))

        #expect(flightStyle.kind == "Journey · Flight")
        #expect(flightStyle.symbol == "airplane")
        #expect(unknownStyle.kind == "Journey")
        #expect(unknownStyle.symbol == "arrow.triangle.swap")
        #expect(stayStyle.kind == "Stay · Hotel")
        #expect(stayStyle.symbol == "bed.double.fill")
        #expect(stayStyle.accent == .popsTripsStay)
        #expect(eventStyle.accent == .popsTripsActivity)
    }
}
