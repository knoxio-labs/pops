import Testing

@testable import DesignPlayground

@Suite("Trips browser calendar")
internal struct TripsBrowserCalendarTests {
    @Test("Actual source clocks and date-only intentions retain distinct precision")
    func sourcePrecision() throws {
        let trip = try #require(tripsBrowserSelectedTrip(tripsBrowserFixture()))
        let day = tripsBrowserCalendar(trip, day: "2027-12-29")
        let flight = day.entries.filter { $0.source.id == "poa-rec" }
        #expect(flight.map(\.boundary) == [.start, .end])
        #expect(flight.first?.clock?.at == "2027-12-29T00:15:00-03:00")
        let coffee = try #require(day.entries.first { $0.source.id == "marina-coffee" })
        #expect(coffee.clock == nil)
        #expect(coffee.day == "2027-12-29")
        let continuing = tripsBrowserCalendar(trip, day: "2027-12-31").entries
        #expect(
            continuing.contains {
                $0.source.id == "carmo" && $0.clock == nil && $0.boundary == .continuing
            })
    }

    @Test("Display-zone date-line changes never overwrite source endpoints")
    func displayZone() throws {
        var trip = try #require(tripsBrowserSelectedTrip(tripsBrowserFixture()))
        trip.today.displayZone = "America/Chicago"
        let original = trip
        let day = tripsBrowserCalendar(trip, day: "2027-11-23")
        let departure = try #require(
            day.entries.first { $0.legID == "syd-dfw" && $0.boundary == .start })
        #expect(departure.clock?.at == "2027-11-24T10:00:00+11:00")
        #expect(departure.clock?.timeZone == "Australia/Sydney")
        #expect(departure.day == "2027-11-23")
        #expect(tripsBrowserCalendarDays(trip).contains("2027-11-23"))
        #expect(trip == original)
    }

    @Test("Arbitrary valid days are accepted while malformed dates and zones are explicit findings")
    func validation() throws {
        var trip = try #require(tripsBrowserSelectedTrip(tripsBrowserFixture()))
        let outside = tripsBrowserCalendar(trip, day: "2035-05-10")
        #expect(outside.day == "2035-05-10")
        #expect(outside.entries.isEmpty)
        let invalid = tripsBrowserCalendar(trip, day: "2027-02-29")
        #expect(invalid.entries.isEmpty)
        #expect(invalid.findings.contains { $0.id == "day" })
        trip.today.displayZone = "Missing/Zone"
        #expect(tripsBrowserCalendar(trip, day: "2027-12-29").findings.contains { $0.id == "zone" })
    }

    @Test("History starts from recorded visit days, not the reference clock or approximate month")
    func visitDayShortcuts() throws {
        let state = tripsBrowserFixture()
        let history = try #require(state.trips.first { $0.id == "portugal-plan" })
        #expect(tripsBrowserCalendarDays(history) == ["2026-04-10", "2026-04-20"])
        var unknown = history
        unknown.visits[0].timing = .month("2026-04")
        #expect(tripsBrowserCalendarDays(unknown) == ["2027-12-29"])
        unknown.today.now = "invalid"
        #expect(tripsBrowserCalendarDays(unknown).isEmpty)
    }

    @Test(
        "Unrelated distant timing and coverage issues appear once at trip level, not on every day")
    func findingScope() throws {
        var trip = try #require(tripsBrowserSelectedTrip(tripsBrowserFixture()))
        trip.today.journeys.append(
            .init(
                id: "distant", name: "Distant journey",
                legs: [
                    .init(
                        id: "distant-leg", name: "Future leg",
                        departure: .init(at: "2035-05-10T10:00:00Z", timeZone: "UTC"))
                ], essentials: .init(), purchased: false))
        #expect(tripsBrowserCalendar(trip, day: "2027-12-29").findings.isEmpty)
        #expect(tripsBrowserCalendar(trip, day: "2027-12-30").findings.isEmpty)
        let findings = tripsBrowserTimingFindings(trip)
        #expect(findings.filter { $0.id == "distant:timing" }.count == 1)
        #expect(findings.contains { $0.id == "olinda-window:gap" })
    }

    @Test("Native picker bridge round-trips civil dates without creating source clocks")
    func pickerBridge() throws {
        let date = try #require(tripsBrowserCalendarDate("2027-12-29", zone: "Australia/Sydney"))
        #expect(tripsBrowserCalendarDay(date, zone: "Australia/Sydney") == "2027-12-29")
        #expect(tripsBrowserCalendarDate("2027-02-30", zone: "UTC") == nil)
        #expect(tripsBrowserCalendarDate("2027-12-29", zone: "Missing/Zone") == nil)
        #expect(tripsBrowserCalendarDay(date, zone: "Missing/Zone") == nil)
    }
}
