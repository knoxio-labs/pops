import Foundation
import Testing

@testable import FeatureTrips

@Suite("Source-backed Today")
internal struct TripTodayProjectionTests {
    @Test(
        "active stay precedes all future kinds and an explicit alternative is never selected by purchase"
    )
    internal func hierarchy() throws {
        let snapshot = try TripTestSources.snapshot()
        let now = try #require(TripClock.instant(local: "2026-01-02T12:00", zone: "UTC"))
        let projection = TripTodayProjection(snapshot: snapshot, at: now)
        #expect(projection.now.map(\.id) == ["stay-1"])
        #expect(projection.next.map(\.id) == ["stay-2", "journey-1"])
        #expect(projection.other.map(\.id) == ["stay-3"])
        #expect(tripSources(snapshot).map(\.id) == ["stay-1", "stay-2", "stay-3", "journey-1"])
        #expect(snapshot.journeys.first { $0.id == 2 }?.legs.first?.purchase == "Purchased")
    }

    @Test("active intervals are half-open, and unknown stay clocks remain unknown")
    internal func boundaries() throws {
        let snapshot = try TripTestSources.snapshot()
        let start = try #require(TripClock.instant(local: "2026-01-01T14:00", zone: "UTC"))
        let end = try #require(TripClock.instant(local: "2026-01-03T11:00", zone: "UTC"))
        #expect(TripTodayProjection(snapshot: snapshot, at: start).now.map(\.id) == ["stay-1"])
        #expect(!TripTodayProjection(snapshot: snapshot, at: end).now.map(\.id).contains("stay-1"))
        let floating = try #require(snapshot.stays.first { $0.id == 3 })
        #expect(TripSource.stay(floating).start == nil)
        #expect(TripSource.stay(floating).end == nil)
        #expect(snapshot.visits.map(\.id) == [4])
    }

    @Test("calendar converts precise clocks but retains independent floating stay dates")
    internal func calendarDates() throws {
        let snapshot = try TripTestSources.snapshot()
        let zone = try #require(TimeZone(identifier: "Pacific/Honolulu"))
        let facts = tripCalendarFacts(snapshot, zone: zone)
        let floating = facts.filter { $0.source.id == "stay-3" }
        #expect(floating.map(\.day) == ["2026-01-02", "2026-01-04"])
        #expect(floating.allSatisfy { $0.instant == nil })
        #expect(facts.filter { $0.source.id == "journey-1" }.allSatisfy { $0.day == "2026-02-01" })
        #expect(!facts.contains { $0.source.id == "journey-2" })
    }
    @Test("past travel requires an explicit end, never a source update timestamp")
    internal func pastBookings() throws {
        let snapshot = try TripTestSources.snapshot()
        let now = try #require(TripClock.instant(local: "2026-01-03T11:00", zone: "UTC"))
        let sources = tripSources(snapshot)
        #expect(
            sources.filter { TripBookingScope.past.includes($0, at: now) }.map(\.id) == ["stay-1"])
        #expect(
            sources.filter { TripBookingScope.currentAndFuture.includes($0, at: now) }.map(\.id)
                == ["stay-2", "journey-1"])
        #expect(sources.filter { TripBookingScope.all.includes($0, at: now) }.count == 4)
        #expect(tripReferenceFindings(snapshot).isEmpty)
    }

    @Test("booking search uses exact references and independent states without classifying them")
    internal func sourceSearch() throws {
        let snapshot = try TripTestSources.snapshot()
        let sources = tripSources(snapshot)
        #expect(
            sources.filter { tripSourceMatches($0, query: " source123 ", places: snapshot.places) }
                .map(\.id) == ["stay-1"])
        #expect(
            sources.filter { tripSourceMatches($0, query: "Booked", places: snapshot.places) }
                .map(\.id) == ["journey-1"])
        #expect(
            sources.filter { tripSourceMatches($0, query: "Purchased", places: snapshot.places) }
                .isEmpty)
        #expect(sources.allSatisfy { tripSourceMatches($0, query: "  ", places: snapshot.places) })
    }
}
