import AppCore
import Testing

@testable import FeatureTrips

@Suite("Source detail local moments")
internal struct TripSourceMomentTests {
    @Test("day-only route endpoints remain day-only")
    internal func dayOnly() {
        let endpoint = TripEndpoint(
            placeId: nil, sourceLabel: "Recife", sourceLinks: nil, local: nil,
            timeZone: "America/Recife", date: "2028-01-02")

        let moment = tripSourceMoment(for: endpoint)

        #expect(moment.day == TripClock.dayLabel("2028-01-02"))
        #expect(moment.clock == nil)
        #expect(moment.timeZone == "America/Recife")
        #expect(moment.resolutionNote == nil)
    }

    @Test("a local endpoint shows its source clock and zone without converting the source day")
    internal func localClock() {
        let endpoint = TripEndpoint(
            placeId: nil, sourceLabel: "Dallas", sourceLinks: nil,
            local: "2028-01-02T00:30", timeZone: "America/Recife")

        let moment = tripSourceMoment(for: endpoint)

        #expect(moment.day == TripClock.dayLabel("2028-01-02"))
        #expect(moment.clock == "00:30")
        #expect(moment.timeZone == "America/Recife")
        #expect(moment.resolutionNote == nil)
    }

    @Test("missing or ambiguous time zones remain explicit instead of implying a valid instant")
    internal func unresolvedClock() {
        let missingZone = tripSourceMoment(
            day: "2026-01-02", clock: "12:00", timeZone: nil)
        let ambiguousZone = tripSourceMoment(
            day: "2026-04-05", clock: "02:30", timeZone: "Australia/Sydney")

        #expect(missingZone.clock == "12:00")
        #expect(missingZone.resolutionNote == "Time zone not supplied")
        #expect(ambiguousZone.clock == "02:30")
        #expect(ambiguousZone.resolutionNote == "Local time could not be resolved")
    }
}
