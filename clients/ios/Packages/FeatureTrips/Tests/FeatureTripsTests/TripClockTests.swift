import Testing

@testable import FeatureTrips

@Suite("Trip source clocks")
internal struct TripClockTests {
    @Test("missing zones, nonexistent and ambiguous local clocks never acquire invented instants")
    internal func unresolvedClocks() {
        #expect(TripClock.instant(local: "2026-01-01T12:00", zone: nil) == nil)
        #expect(TripClock.instant(local: "2026-01-01T12:00", zone: "UTC+3") == nil)
        #expect(TripClock.instant(local: "2026-10-04T02:30", zone: "Australia/Sydney") == nil)
        #expect(TripClock.instant(local: "2026-04-05T02:30", zone: "Australia/Sydney") == nil)
        #expect(TripClock.instant(local: "2026-02-29T12:00", zone: "UTC") == nil)
        #expect(TripClock.instant(local: "2026-01-01T24:00", zone: "UTC") == nil)
        #expect(TripClock.instant(local: "2026-04-05T01:45", zone: "Australia/Lord_Howe") == nil)
        #expect(TripClock.instant(local: "2011-12-30T12:00", zone: "Pacific/Apia") == nil)
        #expect(TripClock.instant(local: "2026-01-01T12:00", zone: "US/Eastern") != nil)
    }

    @Test("source zones independently determine instants across the date line")
    internal func exactSourceZones() throws {
        let first = try #require(
            TripClock.instant(local: "2026-01-02T12:00", zone: "Pacific/Auckland"))
        let second = try #require(
            TripClock.instant(local: "2026-01-01T13:00", zone: "Pacific/Honolulu"))
        #expect(first == second)
        #expect(TripClock.day("2024-02-29") != nil)
        #expect(TripClock.day("2026-02-29") == nil)
        #expect(TripClock.day("2026-13-01") == nil)
        #expect(TripClock.day("2026-1-01") == nil)
    }
}
