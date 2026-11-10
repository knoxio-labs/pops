import Testing

@testable import DesignPlayground

@Suite("Trips browser source timing")
internal struct TripsBrowserTimingTests {
    @Test("Selector grouping uses inclusive exact route boundaries, not free When or purchase")
    func derivedPeriods() throws {
        let state = tripsBrowserFixture()
        #expect(state.trips.map(tripsBrowserPeriod) == [.current, .future, .history])
        var trip = try #require(tripsBrowserSelectedTrip(state))
        trip.visits = [
            .init(
                id: "visit", name: "Visit", placeID: "place",
                timing: .dates(from: "2027-12-29", to: "2028-01-05"))
        ]
        trip.route = [.visit("visit")]
        trip.when = "An opaque label that mentions yesterday"
        trip.today.now = "2027-12-28T12:00:00-03:00"
        #expect(tripsBrowserPeriod(trip) == .future)
        trip.today.now = "2027-12-29T00:00:00-03:00"
        #expect(tripsBrowserPeriod(trip) == .current)
        trip.today.now = "2028-01-05T23:59:59-03:00"
        #expect(tripsBrowserPeriod(trip) == .current)
        trip.today.now = "2028-01-06T00:00:00-03:00"
        #expect(tripsBrowserPeriod(trip) == .history)
    }

    @Test("Unknown and month boundaries do not become exact windows or infer current travel")
    func openPrecision() throws {
        var trip = try #require(tripsBrowserSelectedTrip(tripsBrowserFixture()))
        trip.route = [.visit("only")]
        trip.visits = [
            .init(id: "only", name: "Visit", placeID: "place", timing: .month("2028-02"))
        ]
        #expect(tripsBrowserPeriod(trip) == .other)
        trip.visits[0].timing = .dates(from: "2028-01-01", to: nil)
        #expect(tripsBrowserPeriod(trip) == .future)
        trip.visits[0].timing = .dates(from: nil, to: "2027-12-28")
        #expect(tripsBrowserPeriod(trip) == .history)
        trip.visits[0].timing = .unknown
        #expect(tripsBrowserPeriod(trip) == .other)
    }

    @Test("Missing endpoint visits and invalid calendars never substitute inner dates")
    func unresolvedBoundaries() throws {
        var trip = try #require(tripsBrowserSelectedTrip(tripsBrowserFixture()))
        trip.visits = [
            .init(
                id: "known", name: "Known visit", placeID: "place",
                timing: .dates(from: "2028-01-01", to: "2028-01-05"))
        ]
        trip.route = [.visit("missing"), .visit("known")]
        #expect(tripsBrowserPeriod(trip) == .other)
        trip.route = [.visit("known")]
        trip.visits[0].timing = .dates(from: "2028-01-05", to: "2028-01-01")
        #expect(tripsBrowserPeriod(trip) == .other)
        trip.visits[0].timing = .dates(from: "2027-02-30", to: "2028-01-01")
        #expect(tripsBrowserPeriod(trip) == .other)
        #expect(tripsBrowserFindings(trip).contains { $0.id == "known" })
        trip.today.now = "invalid"
        #expect(tripsBrowserPeriod(trip) == .other)
    }

    @Test("Labels retain source precision and omit unknown or invalid timing")
    func precisionLabels() {
        #expect(tripsBrowserVisitTimingLabel(.unknown).isEmpty)
        #expect(tripsBrowserVisitTimingLabel(.dates(from: nil, to: nil)).isEmpty)
        #expect(tripsBrowserVisitTimingLabel(.month("2028-02")) == "February 2028")
        #expect(tripsBrowserVisitTimingLabel(.month("2028-13")).isEmpty)
        #expect(tripsBrowserVisitTimingLabel(.dates(from: "2028-01-05", to: "2028-01-01")).isEmpty)
        #expect(
            tripsBrowserVisitTimingLabel(.dates(from: "2027-12-29", to: nil)) == "From 29 Dec 2027")
    }
}
