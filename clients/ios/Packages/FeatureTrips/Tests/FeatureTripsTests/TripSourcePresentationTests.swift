import AppCore
import Foundation
import Testing

@testable import FeatureTrips

@Suite("Recorded trip card facts")
internal struct TripSourcePresentationTests {
    private static let unresolvedZones: [String?] = [nil, "Invalid/Zone", "America/New_York"]

    @Test("missing endpoint geography and clocks retain roles without invented airport codes")
    internal func missingEndpoint() {
        let endpoint = TripEndpoint(
            placeId: nil, sourceLabel: nil, sourceLinks: nil, local: nil, timeZone: nil)
        let value = TripEndpointPresentation(endpoint: endpoint, role: "Departure", places: [])
        #expect(value.place == "Departure")
        #expect(value.time == "Time not set")
        #expect(value.day == nil)
        #expect(value.zone == nil)
        #expect(!value.hasUnresolvedClock)
    }

    @Test("a day-only endpoint remains day-only, with no midnight or viewer-zone fallback")
    internal func dayOnlyEndpoint() {
        let endpoint = TripEndpoint(
            placeId: nil, sourceLabel: "Recorded station", sourceLinks: nil,
            local: nil, timeZone: nil, date: "2026-01-03")
        let value = TripEndpointPresentation(endpoint: endpoint, role: "Departure", places: [])
        #expect(value.place == "Recorded station")
        #expect(value.day == TripClock.dayLabel("2026-01-03"))
        #expect(value.time == "Time not set")
        #expect(value.zone == nil)
    }

    @Test(
        "unresolved source clocks remain verbatim",
        arguments: TripSourcePresentationTests.unresolvedZones)
    internal func unresolvedEndpoint(zone: String?) {
        let endpoint = TripEndpoint(
            placeId: nil, sourceLabel: "Recorded departure", sourceLinks: nil,
            local: "2026-11-01T01:30", timeZone: zone)
        let value = TripEndpointPresentation(endpoint: endpoint, role: "Departure", places: [])
        #expect(value.time == "2026-11-01T01:30")
        #expect(value.hasUnresolvedClock)
        #expect(value.zone == zone)
    }

    @Test("resolved endpoint formatting stays in its own recorded zone")
    internal func sourceZone() throws {
        let endpoint = TripEndpoint(
            placeId: nil, sourceLabel: "Recorded departure", sourceLinks: nil,
            local: "2026-01-03T14:00", timeZone: "Australia/Sydney")
        let value = TripEndpointPresentation(endpoint: endpoint, role: "Departure", places: [])
        let zone = try #require(TimeZone(identifier: "Australia/Sydney"))
        let instant = try #require(
            TripClock.instant(local: endpoint.local, zone: endpoint.timeZone))
        #expect(value.time == TripClock.clockLabel(instant, zone: zone))
        #expect(value.day == TripClock.dateLabel(instant, zone: zone))
        #expect(value.zone == "Australia/Sydney")
        #expect(!value.hasUnresolvedClock)
    }

    @Test("Now stay cards prioritize the exact checkout rather than an earlier check-in")
    internal func currentCheckout() throws {
        let snapshot = try TripTestSources.snapshot()
        let stay = try #require(snapshot.stays.first { $0.id == 1 })
        let value = TripSourceSchedulePresentation(source: .stay(stay), isCurrent: true)
        #expect(value.label == "Checkout")
        #expect(value.recordedClock == "11:00")
        #expect(value.instant == TripSource.stay(stay).end)
        #expect(value.instant != TripSource.stay(stay).start)
    }

    @Test("a supplied local stay clock without its zone is unresolved, not missing")
    internal func unresolvedStay() {
        let stay = TripStay(
            id: 1, tripId: 1, visitId: nil, name: "Recorded stay", kind: nil, status: nil,
            timing: TripStayTiming(
                arrival: "2026-01-02", departure: nil, checkIn: "14:00", checkOut: nil,
                timeZone: nil),
            address: nil, reference: nil, notes: "", sourceLinks: [], hostLinks: [],
            documentLinks: [])
        let value = TripSourceSchedulePresentation(source: .stay(stay), isCurrent: false)
        #expect(value.instant == nil)
        #expect(value.recordedClock == "14:00")
        #expect(value.recordedZone == nil)
        #expect(value.hasUnresolvedClock)
    }
}
